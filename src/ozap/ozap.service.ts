import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OzapWebhookDto } from './dto/ozap-webhook.dto';

type MessageReceivedData = {
  chat_id?: unknown;
  message_id?: unknown;
  from?: unknown;
  content?: unknown;
  contact_name?: unknown;
};

type ChatStatusChangedData = {
  chat_id?: unknown;
  new_status?: unknown;
  lead_category?: unknown;
};

const CATEGORIA_PRIORIDADE: Record<string, string> = {
  cold: 'Baixa',
  warm: 'Média',
  hot: 'Alta',
  purchased: 'Alta',
};

@Injectable()
export class OzapService {
  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(payload: OzapWebhookDto) {
    const data = payload.data;
    const chatId = this.asString(data.chat_id);
    const messageId = this.asString(data.message_id);
    const deliveryKey = [
      payload.instance_id,
      payload.event,
      messageId ?? `${chatId ?? 'sem-chat'}:${payload.timestamp}`,
    ].join(':');

    try {
      await this.prisma.ozapWebhookDelivery.create({
        data: {
          deliveryKey,
          event: payload.event,
          instanceId: payload.instance_id,
          chatId,
          messageId,
          // Não persistimos o conteúdo da conversa neste log de idempotência.
          payload: { timestamp: payload.timestamp } as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: true, duplicate: true };
      }
      throw error;
    }

    if (payload.event === 'message.received') {
      const leadId = await this.handleMessageReceived(
        payload.instance_id,
        data as MessageReceivedData,
        payload.timestamp,
      );
      return { ok: true, leadId };
    }

    if (payload.event === 'chat.status_changed') {
      await this.handleStatusChanged(
        payload.instance_id,
        data as ChatStatusChangedData,
      );
    }

    return { ok: true };
  }

  private async handleMessageReceived(
    instanceId: number,
    data: MessageReceivedData,
    timestamp: string,
  ) {
    const chatId = this.requiredString(data.chat_id, 'chat_id');
    const phone = this.formatBrazilianPhone(
      this.requiredString(data.from, 'from'),
    );
    const contactName = this.asString(data.contact_name) || 'Lead WhatsApp';
    const timestampDate = this.parseDate(timestamp);

    const existingLink = await this.prisma.leadOzapLink.findUnique({
      where: { instanceId_chatId: { instanceId, chatId } },
      include: { lead: true },
    });

    let lead = existingLink?.lead;
    if (!lead) {
      lead =
        (await this.prisma.lead.findFirst({
          where: { telefone: phone, perdidoAt: null },
        })) ?? undefined;
    }

    if (!lead) {
      const digits = phone.replace(/\D/g, '');
      lead = await this.prisma.lead.create({
        data: {
          nome: contactName,
          telefone: phone,
          email: `${digits}@whatsapp.ozap.local`,
          origem: 'WhatsApp',
          interesse: 'Comprar',
          cidade: 'A definir',
          bairro: 'A definir',
          stage: 'novo',
          prioridade: 'Média',
          tags: ['WhatsApp', 'OZap'],
        },
      });
    } else if (
      lead.nome.trim().toLocaleLowerCase('pt-BR') === 'lead whatsapp' &&
      contactName !== 'Lead WhatsApp'
    ) {
      lead = await this.prisma.lead.update({
        where: { id: lead.id },
        data: { nome: contactName },
      });
    }

    await this.prisma.leadOzapLink.upsert({
      where: { leadId: lead.id },
      create: {
        leadId: lead.id,
        instanceId,
        chatId,
        lastMessageAt: timestampDate,
      },
      update: { lastMessageAt: timestampDate },
    });

    return lead.id;
  }

  private async handleStatusChanged(
    instanceId: number,
    data: ChatStatusChangedData,
  ) {
    const chatId = this.asString(data.chat_id);
    if (!chatId) return;

    const link = await this.prisma.leadOzapLink.findUnique({
      where: { instanceId_chatId: { instanceId, chatId } },
    });
    if (!link) return;

    const categoria =
      this.asString(data.lead_category) ?? this.asString(data.new_status);
    if (!categoria) return;

    const prioridade = CATEGORIA_PRIORIDADE[categoria];
    const lead = await this.prisma.lead.findUnique({
      where: { id: link.leadId },
      select: { tags: true },
    });
    if (!lead) return;

    const tags = [
      ...lead.tags.filter((tag) => !tag.startsWith('OZap:')),
      `OZap: ${this.labelCategoria(categoria)}`,
    ];
    await this.prisma.$transaction([
      this.prisma.leadOzapLink.update({
        where: { id: link.id },
        data: { categoria },
      }),
      this.prisma.lead.update({
        where: { id: link.leadId },
        data: { ...(prioridade ? { prioridade } : {}), tags },
      }),
    ]);
  }

  private formatBrazilianPhone(raw: string) {
    const digits = raw.replace(/\D/g, '').replace(/^55/, '');
    if (!/^\d{10,11}$/.test(digits)) {
      throw new Error('Telefone OZap inválido.');
    }
    const ddd = digits.slice(0, 2);
    const local = digits.slice(2);
    return local.length === 9
      ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
      : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }

  private requiredString(value: unknown, field: string) {
    const normalized = this.asString(value);
    if (!normalized) throw new Error(`Campo OZap obrigatório ausente: ${field}.`);
    return normalized;
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private parseDate(value: string) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private labelCategoria(categoria: string) {
    return (
      {
        cold: 'frio',
        warm: 'morno',
        hot: 'quente',
        purchased: 'comprou',
        human_intervention: 'atendimento humano',
      }[categoria] ?? categoria
    );
  }
}
