import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaWebhookDto } from './dto/meta-webhook.dto';
import {
  MetaGraphApiService,
  MetaLeadField,
  MetaLeadPayload,
} from './meta-graph-api.service';

type LeadgenEvent = {
  leadgenId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
};

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly graphApi: MetaGraphApiService,
  ) {}

  verifyChallenge(mode?: string, token?: string, challenge?: string) {
    const expected = this.config.get<string>('META_VERIFY_TOKEN');
    if (
      mode === 'subscribe' &&
      expected &&
      token &&
      token === expected &&
      challenge
    ) {
      return challenge;
    }
    return null;
  }

  async handleWebhook(payload: MetaWebhookDto) {
    const configuredPageId = this.config.get<string>('META_PAGE_ID');
    const events = this.extractLeadgenEvents(payload);
    const leadIds: string[] = [];

    for (const event of events) {
      if (configuredPageId && event.pageId !== configuredPageId) {
        this.logger.warn(
          `Ignorando leadgen ${event.leadgenId}: page_id ${event.pageId} ≠ META_PAGE_ID.`,
        );
        continue;
      }

      const result = await this.processLeadgenEvent(event, payload);
      if (result.leadId) leadIds.push(result.leadId);
    }

    return { ok: true, leadIds };
  }

  private extractLeadgenEvents(payload: MetaWebhookDto): LeadgenEvent[] {
    const events: LeadgenEvent[] = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const leadgenId = this.asId(change.value?.leadgen_id);
        const pageId = this.asId(change.value?.page_id);
        if (!leadgenId || !pageId) continue;

        events.push({
          leadgenId,
          pageId,
          formId: this.asId(change.value?.form_id),
          adId: this.asId(change.value?.ad_id),
          adgroupId: this.asId(change.value?.adgroup_id),
        });
      }
    }

    return events;
  }

  private async processLeadgenEvent(
    event: LeadgenEvent,
    payload: MetaWebhookDto,
  ) {
    const deliveryKey = `leadgen:${event.leadgenId}`;

    try {
      await this.prisma.metaWebhookDelivery.create({
        data: {
          deliveryKey,
          leadgenId: event.leadgenId,
          pageId: event.pageId,
          formId: event.formId,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.leadMetaLink.findUnique({
          where: { leadgenId: event.leadgenId },
          select: { leadId: true },
        });
        return { ok: true, duplicate: true, leadId: existing?.leadId };
      }
      throw error;
    }

    try {
      const existingLink = await this.prisma.leadMetaLink.findUnique({
        where: { leadgenId: event.leadgenId },
        select: { leadId: true },
      });
      if (existingLink) {
        return { ok: true, duplicate: true, leadId: existingLink.leadId };
      }

      const metaLead = await this.graphApi.fetchLead(event.leadgenId);
      const mapped = this.mapFieldData(metaLead.field_data ?? []);
      const lead = await this.findOrCreateLead(mapped, event, metaLead);

      await this.prisma.leadMetaLink.upsert({
        where: { leadgenId: event.leadgenId },
        create: {
          leadId: lead.id,
          leadgenId: event.leadgenId,
          pageId: event.pageId,
          formId: event.formId ?? metaLead.form_id ?? null,
          adId: event.adId ?? metaLead.ad_id ?? null,
          adgroupId: event.adgroupId,
        },
        update: {},
      });

      this.logger.log(
        `Lead Meta ${event.leadgenId} → CRM lead ${lead.id}`,
      );
      return { ok: true, leadId: lead.id };
    } catch (error) {
      // Libera a chave para a Meta reenviar o evento após falha (Graph API, etc.).
      await this.prisma.metaWebhookDelivery
        .delete({ where: { deliveryKey } })
        .catch(() => undefined);
      throw error;
    }
  }

  private async findOrCreateLead(
    mapped: ReturnType<MetaService['mapFieldData']>,
    event: LeadgenEvent,
    metaLead: MetaLeadPayload,
  ) {
    const reusable = await this.findReusableLead(mapped);
    if (reusable) {
      await this.mergeTags(reusable.id, reusable.tags, mapped.extraTags);
      return reusable;
    }

    const tags = [
      'Facebook',
      'Lead Ads',
      ...mapped.extraTags,
      ...(event.formId ? [`Form: ${event.formId}`] : []),
      ...(event.adId || metaLead.ad_id
        ? [`Ad: ${event.adId ?? metaLead.ad_id}`]
        : []),
    ];

    return this.prisma.lead.create({
      data: {
        nome: mapped.nome,
        telefone: mapped.telefone ?? '(00) 00000-0000',
        email: mapped.email ?? `${event.leadgenId}@facebook.meta.local`,
        origem: 'Facebook Ads',
        interesse: 'Comprar',
        cidade: mapped.cidade ?? 'A definir',
        bairro: mapped.bairro ?? 'A definir',
        stage: 'novo',
        prioridade: 'Média',
        tags,
      },
    });
  }

  /** Reusa lead existente sem vínculo Meta (evita conflito no leadId unique). */
  private async findReusableLead(
    mapped: ReturnType<MetaService['mapFieldData']>,
  ) {
    if (mapped.telefone) {
      const byPhone = await this.prisma.lead.findFirst({
        where: { telefone: mapped.telefone, perdidoAt: null },
        include: { metaLink: true },
      });
      if (byPhone && !byPhone.metaLink) return byPhone;
    }

    if (mapped.email && !mapped.email.endsWith('@facebook.meta.local')) {
      const byEmail = await this.prisma.lead.findFirst({
        where: { email: mapped.email, perdidoAt: null },
        include: { metaLink: true },
      });
      if (byEmail && !byEmail.metaLink) return byEmail;
    }

    return null;
  }

  private async mergeTags(
    leadId: string,
    current: string[],
    extra: string[],
  ) {
    const next = new Set([
      ...current,
      'Facebook',
      'Lead Ads',
      ...extra,
    ]);
    if (next.size === current.length) return;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { tags: [...next] },
    });
  }

  private mapFieldData(fields: MetaLeadField[]) {
    const byName = new Map<string, string>();
    for (const field of fields) {
      const key = field.name?.trim().toLowerCase();
      const value = field.values?.find((v) => typeof v === 'string' && v.trim());
      if (key && value) byName.set(key, value.trim());
    }

    const get = (...keys: string[]) => {
      for (const key of keys) {
        const value = byName.get(key);
        if (value) return value;
      }
      return null;
    };

    const firstName = get('first_name', 'nome');
    const lastName = get('last_name', 'sobrenome');
    const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const fullName =
      get('full_name', 'nome_completo', 'name') || joinedName || null;

    const rawPhone = get(
      'phone_number',
      'phone',
      'telefone',
      'mobile_phone',
      'work_phone_number',
    );
    const rawEmail = get('email', 'e-mail', 'work_email');
    const cidade = get('city', 'cidade');
    const bairro = get('street_address', 'bairro', 'neighborhood');

    const extraTags: string[] = [];
    for (const [key, value] of byName) {
      if (
        [
          'full_name',
          'first_name',
          'last_name',
          'nome',
          'nome_completo',
          'name',
          'sobrenome',
          'phone_number',
          'phone',
          'telefone',
          'mobile_phone',
          'work_phone_number',
          'email',
          'e-mail',
          'work_email',
          'city',
          'cidade',
          'street_address',
          'bairro',
          'neighborhood',
        ].includes(key)
      ) {
        continue;
      }
      extraTags.push(`${key}: ${value.slice(0, 80)}`);
    }

    return {
      nome: fullName || 'Lead Facebook',
      telefone: rawPhone ? this.formatPhoneOrFallback(rawPhone) : null,
      email: rawEmail && this.isValidEmail(rawEmail) ? rawEmail : null,
      cidade,
      bairro,
      extraTags,
    };
  }

  private formatPhoneOrFallback(raw: string) {
    const digits = raw.replace(/\D/g, '').replace(/^55/, '');
    if (/^\d{10,11}$/.test(digits)) {
      const ddd = digits.slice(0, 2);
      const local = digits.slice(2);
      return local.length === 9
        ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
        : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
    }
    // Mantém algum valor legível quando o número não é BR padrão.
    const fallback = digits.slice(-11) || '00000000000';
    const padded = fallback.padStart(11, '0').slice(-11);
    return `(${padded.slice(0, 2)}) ${padded.slice(2, 7)}-${padded.slice(7)}`;
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private asId(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return null;
  }
}
