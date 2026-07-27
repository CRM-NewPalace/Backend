import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendamentoEscopo,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
  CatalogType,
  Prisma,
  Role,
  TriagemOrigem,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentoDto } from './dto/query-agendamento.dto';

/** Etapas anteriores a "visita-agendada" — ao confirmar visita, avançamos o funil. */
const STAGES_BEFORE_VISITA = new Set([
  'novo',
  'contato',
  'qualificacao',
  'em-analise',
]);

const agendamentoSelect = {
  id: true,
  leadId: true,
  titulo: true,
  tipo: true,
  status: true,
  escopo: true,
  solicitacaoStatus: true,
  startsAt: true,
  endsAt: true,
  local: true,
  observacoes: true,
  motivoRecusa: true,
  aprovadoAt: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true } },
  aprovadoPor: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      telefone: true,
      stage: true,
      corretorId: true,
      corretor: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Compromissos confirmados no calendário/tabela (pessoal + aprovados). */
  async list(query: QueryAgendamentoDto, requester: AuthenticatedUser) {
    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(await this.teamScope.leadScope(requester)),
    };

    if (query.corretorId && requester.role !== Role.corretor) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) {
        return [];
      }
      leadFilter.corretorId = query.corretorId;
    }

    const where: Prisma.AgendamentoWhereInput = {
      lead: leadFilter,
      OR: [
        { escopo: AgendamentoEscopo.pessoal },
        {
          escopo: AgendamentoEscopo.com_gerente,
          solicitacaoStatus: AgendamentoSolicitacaoStatus.aprovada,
        },
        // Corretor vê as próprias solicitações pendentes (aguardando gerente).
        ...(requester.role === Role.corretor
          ? [
              {
                autorId: requester.id,
                escopo: AgendamentoEscopo.com_gerente,
                solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
              },
            ]
          : []),
      ],
    };

    if (query.tipo) where.tipo = query.tipo;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }

    return this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Solicitações pendentes relevantes para o usuário (gerente aprova / corretor acompanha). */
  async listSolicitacoes(requester: AuthenticatedUser) {
    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(await this.teamScope.leadScope(requester)),
    };

    const where: Prisma.AgendamentoWhereInput = {
      escopo: AgendamentoEscopo.com_gerente,
      solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
      lead: leadFilter,
    };

    if (requester.role === Role.corretor) {
      where.autorId = requester.id;
    }

    return this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: { startsAt: 'asc' },
    });
  }

  async countSolicitacoes(requester: AuthenticatedUser) {
    const items = await this.listSolicitacoes(requester);
    return { count: items.length };
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const item = await this.prisma.agendamento.findUnique({
      where: { id },
      select: agendamentoSelect,
    });
    if (!item) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureLeadAccessible(item.leadId, requester);
    return item;
  }

  async create(dto: CreateAgendamentoDto, requester: AuthenticatedUser) {
    const lead = await this.ensureLeadAccessible(dto.leadId, requester);
    const startsAt = new Date(dto.startsAt);
    const endsAt = this.parseOptionalDate(dto.endsAt);
    this.assertTimeRange(startsAt, endsAt);

    const escopo = dto.escopo as AgendamentoEscopo;
    const needsApproval =
      escopo === AgendamentoEscopo.com_gerente &&
      requester.role === Role.corretor;

    const solicitacaoStatus = needsApproval
      ? AgendamentoSolicitacaoStatus.pendente
      : escopo === AgendamentoEscopo.com_gerente
        ? AgendamentoSolicitacaoStatus.aprovada
        : AgendamentoSolicitacaoStatus.nenhuma;

    const created = await this.prisma.agendamento.create({
      data: {
        leadId: lead.id,
        autorId: requester.id,
        titulo: dto.titulo.trim(),
        tipo: dto.tipo as AgendamentoTipo,
        escopo,
        solicitacaoStatus,
        status: AgendamentoStatus.agendado,
        startsAt,
        endsAt,
        local: dto.local?.trim() || null,
        observacoes: dto.observacoes?.trim() || null,
        ...(solicitacaoStatus === AgendamentoSolicitacaoStatus.aprovada
          ? {
              aprovadoPorId: requester.id,
              aprovadoAt: new Date(),
            }
          : {}),
      },
      select: agendamentoSelect,
    });

    if (needsApproval) {
      const destinatarios = await this.resolveGerenteIds(requester.id);
      const when = startsAt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      await Promise.all(
        destinatarios.map((userId) =>
          this.notificacoes.createAgendaSolicitacao({
            userId,
            agendamentoId: created.id,
            leadId: lead.id,
            titulo: created.titulo,
            autorNome: requester.name,
            quando: when,
          }),
        ),
      );
    } else if (
      created.tipo === AgendamentoTipo.visita &&
      STAGES_BEFORE_VISITA.has(lead.stage)
    ) {
      await this.advanceLeadToVisitaAgendada(
        lead.id,
        lead.stage,
        requester.id,
      );
    }

    return created;
  }

  async update(
    id: string,
    dto: UpdateAgendamentoDto,
    requester: AuthenticatedUser,
  ) {
    const existing = await this.prisma.agendamento.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        startsAt: true,
        endsAt: true,
        solicitacaoStatus: true,
        escopo: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    if (
      existing.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente &&
      requester.role === Role.corretor &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Solicitação pendente — apenas o autor ou o gerente podem alterar.',
      );
    }

    const startsAt =
      dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt !== undefined
        ? this.parseOptionalDate(dto.endsAt)
        : existing.endsAt;
    this.assertTimeRange(startsAt, endsAt);

    const data: Prisma.AgendamentoUpdateInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.tipo !== undefined) data.tipo = dto.tipo as AgendamentoTipo;
    if (dto.status !== undefined) data.status = dto.status as AgendamentoStatus;
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.local !== undefined) data.local = dto.local?.trim() || null;
    if (dto.observacoes !== undefined) {
      data.observacoes = dto.observacoes?.trim() || null;
    }

    return this.prisma.agendamento.update({
      where: { id },
      data,
      select: agendamentoSelect,
    });
  }

  async aprovar(id: string, requester: AuthenticatedUser) {
    this.assertGerenteOuAdmin(requester);

    const existing = await this.prisma.agendamento.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        titulo: true,
        tipo: true,
        escopo: true,
        solicitacaoStatus: true,
        startsAt: true,
        lead: { select: { stage: true, nome: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
    await this.ensureLeadAccessible(existing.leadId, requester);

    if (existing.escopo !== AgendamentoEscopo.com_gerente) {
      throw new BadRequestException('Este compromisso não exige aprovação.');
    }
    if (existing.solicitacaoStatus !== AgendamentoSolicitacaoStatus.pendente) {
      throw new BadRequestException('Solicitação não está pendente.');
    }

    const updated = await this.prisma.agendamento.update({
      where: { id },
      data: {
        solicitacaoStatus: AgendamentoSolicitacaoStatus.aprovada,
        aprovadoPorId: requester.id,
        aprovadoAt: new Date(),
        motivoRecusa: null,
      },
      select: agendamentoSelect,
    });

    await this.notificacoes.createAgendaResposta({
      userId: existing.autorId,
      agendamentoId: existing.id,
      leadId: existing.leadId,
      titulo: existing.titulo,
      aprovado: true,
    });

    if (
      existing.tipo === AgendamentoTipo.visita &&
      STAGES_BEFORE_VISITA.has(existing.lead.stage)
    ) {
      await this.advanceLeadToVisitaAgendada(
        existing.leadId,
        existing.lead.stage,
        requester.id,
      );
    }

    return updated;
  }

  async recusar(
    id: string,
    motivo: string | undefined,
    requester: AuthenticatedUser,
  ) {
    this.assertGerenteOuAdmin(requester);

    const existing = await this.prisma.agendamento.findUnique({
      where: { id },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        titulo: true,
        escopo: true,
        solicitacaoStatus: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
    await this.ensureLeadAccessible(existing.leadId, requester);

    if (existing.escopo !== AgendamentoEscopo.com_gerente) {
      throw new BadRequestException('Este compromisso não exige aprovação.');
    }
    if (existing.solicitacaoStatus !== AgendamentoSolicitacaoStatus.pendente) {
      throw new BadRequestException('Solicitação não está pendente.');
    }

    const updated = await this.prisma.agendamento.update({
      where: { id },
      data: {
        solicitacaoStatus: AgendamentoSolicitacaoStatus.recusada,
        status: AgendamentoStatus.cancelado,
        aprovadoPorId: requester.id,
        aprovadoAt: new Date(),
        motivoRecusa: motivo?.trim() || null,
      },
      select: agendamentoSelect,
    });

    await this.notificacoes.createAgendaResposta({
      userId: existing.autorId,
      agendamentoId: existing.id,
      leadId: existing.leadId,
      titulo: existing.titulo,
      aprovado: false,
      motivo: motivo?.trim(),
    });

    return updated;
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const existing = await this.prisma.agendamento.findUnique({
      where: { id },
      select: { id: true, leadId: true, autorId: true },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    if (
      requester.role === Role.corretor &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Você só pode excluir agendamentos que criou.',
      );
    }

    await this.prisma.agendamento.delete({ where: { id } });
    return { ok: true };
  }

  private assertGerenteOuAdmin(requester: AuthenticatedUser) {
    if (requester.role === Role.corretor) {
      throw new ForbiddenException(
        'Apenas gerente ou admin podem aprovar solicitações.',
      );
    }
  }

  private async resolveGerenteIds(corretorId: string): Promise<string[]> {
    const corretor = await this.prisma.user.findUnique({
      where: { id: corretorId },
      select: { equipe: { select: { gerenteId: true } } },
    });
    if (corretor?.equipe?.gerenteId) {
      return [corretor.equipe.gerenteId];
    }
    const admins = await this.prisma.user.findMany({
      where: { role: Role.admin, status: UserStatus.ativo },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  private parseOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return new Date(value);
  }

  private assertTimeRange(startsAt: Date, endsAt: Date | null) {
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Data/hora de início inválida.');
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Data/hora de término inválida.');
    }
    if (endsAt && endsAt.getTime() < startsAt.getTime()) {
      throw new BadRequestException(
        'O término deve ser igual ou posterior ao início.',
      );
    }
  }

  private async advanceLeadToVisitaAgendada(
    leadId: string,
    stageAnterior: string,
    autorId: string,
  ) {
    const stageNovo = 'visita-agendada';
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { stage: stageNovo },
    });

    const [fromLabel, toLabel] = await Promise.all([
      this.resolveStageLabel(stageAnterior),
      this.resolveStageLabel(stageNovo),
    ]);

    await this.prisma.triagemEvent.create({
      data: {
        leadId,
        autorId,
        texto: `Etapa avançada de "${fromLabel}" para "${toLabel}" (visita agendada).`,
        stageAnterior,
        stageNovo,
        origem: TriagemOrigem.funil,
      },
    });
  }

  private async resolveStageLabel(slug: string): Promise<string> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { type: CatalogType.funil_etapa, slug },
      select: { label: true },
    });
    return item?.label ?? slug;
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        tipo: true,
        nome: true,
        stage: true,
        corretorId: true,
        perdidoAt: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    return lead;
  }
}
