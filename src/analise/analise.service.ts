import { Injectable, NotFoundException } from '@nestjs/common';
import { AnaliseStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { QueryAnaliseDto, UpdateAnaliseDto } from './dto/analise.dto';

const analiseSelect = {
  id: true,
  leadId: true,
  tipoContato: true,
  stageSituacao: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  prioridade: true,
  renda: true,
  tags: true,
  temFgts: true,
  valorFgts: true,
  temEntrada: true,
  valorEntrada: true,
  temDependente: true,
  status: true,
  parecer: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      corretorId: true,
      corretor: { select: { id: true, name: true, whatsapp: true } },
    },
  },
} as const;

@Injectable()
export class AnaliseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async list(query: QueryAnaliseDto, requester: AuthenticatedUser) {
    await this.backfillMissing(requester);

    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(await this.teamScope.leadScope(requester)),
    };

    if (query.corretorId) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) {
        return [];
      }
      leadFilter.corretorId = query.corretorId;
    }

    return this.prisma.analise.findMany({
      where: { lead: leadFilter },
      select: analiseSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const item = await this.prisma.analise.findUnique({
      where: { id },
      select: analiseSelect,
    });
    if (!item) {
      throw new NotFoundException('Análise não encontrada.');
    }
    await this.ensureLeadAccessible(item.leadId, requester);
    return item;
  }

  async update(
    id: string,
    dto: UpdateAnaliseDto,
    requester: AuthenticatedUser,
  ) {
    const existing = await this.prisma.analise.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        status: true,
        nome: true,
        lead: { select: { corretorId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Análise não encontrada.');
    }
    await this.ensureLeadAccessible(existing.leadId, requester);

    const updated = await this.prisma.analise.update({
      where: { id },
      data: {
        ...(dto.status !== undefined
          ? { status: dto.status as AnaliseStatus }
          : {}),
        ...(dto.parecer !== undefined
          ? { parecer: dto.parecer?.trim() || null }
          : {}),
      },
      select: analiseSelect,
    });

    const newStatus = updated.status;
    const statusChanged =
      dto.status !== undefined && dto.status !== existing.status;
    if (
      statusChanged &&
      (newStatus === AnaliseStatus.aprovado ||
        newStatus === AnaliseStatus.reprovado) &&
      existing.lead.corretorId &&
      existing.lead.corretorId !== requester.id
    ) {
      await this.notificacoes.createAnaliseResultado({
        userId: existing.lead.corretorId,
        leadId: existing.leadId,
        analiseId: updated.id,
        nomeProcesso: updated.nome,
        status: newStatus,
        parecer: updated.parecer,
      });
    }

    return updated;
  }

  /**
   * Cria a ficha de análise ao entrar em "em-analise" (idempotente).
   * Usa snapshot do lead + última documentação, se houver.
   */
  async ensureForLead(leadId: string, autorId: string) {
    const existing = await this.prisma.analise.findUnique({
      where: { leadId },
      select: { id: true },
    });
    if (existing) return existing;

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        tipo: true,
        stage: true,
        nome: true,
        telefone: true,
        email: true,
        origem: true,
        interesse: true,
        cidade: true,
        bairro: true,
        prioridade: true,
        renda: true,
        tags: true,
        perdidoAt: true,
        documentacoes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            temFgts: true,
            valorFgts: true,
            temEntrada: true,
            valorEntrada: true,
            temDependente: true,
            nome: true,
            telefone: true,
            email: true,
            origem: true,
            interesse: true,
            cidade: true,
            bairro: true,
            prioridade: true,
            renda: true,
            tags: true,
          },
        },
      },
    });

    if (!lead || lead.perdidoAt) {
      return null;
    }

    const doc = lead.documentacoes[0];

    try {
      return await this.prisma.analise.create({
        data: {
          leadId: lead.id,
          autorId,
          tipoContato: lead.tipo,
          stageSituacao: lead.stage,
          nome: (doc?.nome ?? lead.nome).trim(),
          telefone: (doc?.telefone ?? lead.telefone).trim(),
          email: (doc?.email ?? lead.email).trim().toLowerCase(),
          origem: (doc?.origem ?? lead.origem).trim(),
          interesse: doc?.interesse ?? lead.interesse,
          cidade: (doc?.cidade ?? lead.cidade).trim(),
          bairro: (doc?.bairro ?? lead.bairro).trim(),
          prioridade: doc?.prioridade ?? lead.prioridade,
          renda: doc?.renda ?? lead.renda ?? null,
          tags: doc?.tags ?? lead.tags ?? [],
          temFgts: doc?.temFgts ?? false,
          valorFgts: doc?.temFgts ? (doc.valorFgts ?? null) : null,
          temEntrada: doc?.temEntrada ?? false,
          valorEntrada: doc?.temEntrada ? (doc.valorEntrada ?? null) : null,
          temDependente: doc?.temDependente ?? false,
          status: AnaliseStatus.pendente,
        },
        select: { id: true },
      });
    } catch (err) {
      // Corrida: outra request criou no mesmo instante.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.analise.findUnique({
          where: { leadId },
          select: { id: true },
        });
      }
      throw err;
    }
  }

  /** Leads já em em-analise sem ficha → cria sob demanda (dados legados). */
  private async backfillMissing(requester: AuthenticatedUser) {
    const leadScope = await this.teamScope.leadScope(requester);
    const leads = await this.prisma.lead.findMany({
      where: {
        perdidoAt: null,
        stage: 'em-analise',
        analise: null,
        ...leadScope,
      },
      select: { id: true, corretorId: true },
      take: 50,
    });

    for (const lead of leads) {
      const autorId = lead.corretorId ?? requester.id;
      await this.ensureForLead(lead.id, autorId);
    }
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        corretorId: true,
        perdidoAt: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Análise não encontrada.');
    }

    // Só admin/gerente chegam aqui (RolesGuard); reforça escopo de equipe.
    if (requester.role === Role.corretor) {
      throw new NotFoundException('Análise não encontrada.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Análise não encontrada.');
    }

    return lead;
  }
}
