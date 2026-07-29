import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendamentoAlvo,
  AgendamentoEscopo,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
  CatalogType,
  NotificacaoTipo,
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
  autorId: true,
  titulo: true,
  tipo: true,
  status: true,
  escopo: true,
  solicitacaoStatus: true,
  alvoTipo: true,
  alvoEquipeId: true,
  alvoGerenteId: true,
  startsAt: true,
  endsAt: true,
  local: true,
  observacoes: true,
  motivoRecusa: true,
  aprovadoAt: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true, role: true } },
  aprovadoPor: { select: { id: true, name: true } },
  alvoEquipe: { select: { id: true, name: true } },
  alvoGerente: { select: { id: true, name: true } },
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

  /** Compromissos no calendário/tabela.
   * - eventos do admin: conforme alvoTipo (todos / equipe / gerente)
   * - pessoal: só o autor
   * - com_gerente aprovado: autor + gerente/admin da equipe
   * - com_gerente pendente: corretor autor ainda vê no calendário
   */
  async list(query: QueryAgendamentoDto, requester: AuthenticatedUser) {
    const sharedAccess = await this.buildSharedAccessFilter(
      requester,
      query.corretorId,
      query.equipeId,
    );
    if (!sharedAccess) return [];

    const adminEventVisibility = await this.buildAdminEventVisibility(
      requester,
      query.equipeId,
    );

    const where: Prisma.AgendamentoWhereInput = {
      AND: [
        {
          OR: [
            ...(adminEventVisibility ? [adminEventVisibility] : []),
            {
              escopo: AgendamentoEscopo.pessoal,
              autorId: requester.id,
              alvoTipo: AgendamentoAlvo.nenhum,
            },
            {
              AND: [
                {
                  escopo: AgendamentoEscopo.com_gerente,
                  solicitacaoStatus: AgendamentoSolicitacaoStatus.aprovada,
                  alvoTipo: AgendamentoAlvo.nenhum,
                },
                sharedAccess,
              ],
            },
            ...(requester.role === Role.corretor
              ? [
                  {
                    autorId: requester.id,
                    escopo: AgendamentoEscopo.com_gerente,
                    solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
                    alvoTipo: AgendamentoAlvo.nenhum,
                  },
                ]
              : []),
          ],
        },
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
    const sharedAccess = await this.buildSharedAccessFilter(requester);
    if (!sharedAccess) return [];

    const where: Prisma.AgendamentoWhereInput = {
      AND: [
        sharedAccess,
        {
          escopo: AgendamentoEscopo.com_gerente,
          solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
          status: { not: AgendamentoStatus.cancelado },
        },
      ],
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

  /**
   * Sincroniza lembretes (1d / 2h / 1h) e retorna alerta para badge + card.
   * Chamado no login/polling do front — sem cron no servidor.
   */
  async syncLembretes(requester: AuthenticatedUser) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const MS_1H = 60 * 60 * 1000;
    const MS_2H = 2 * MS_1H;
    const MS_1D = 24 * MS_1H;

    const upcoming = await this.list(
      {
        status: AgendamentoStatus.agendado,
        from: now.toISOString(),
        to: horizon.toISOString(),
      },
      requester,
    );

    const corretorIds = Array.from(
      new Set(
        upcoming
          .map((item) => {
            if (item.lead?.corretorId) return item.lead.corretorId;
            if (item.autor.role === Role.corretor) return item.autorId;
            return null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const equipeInfoByCorretorId =
      await this.resolveEquipeInfoByCorretorIds(corretorIds);

    // Gerentes autores: resolve a equipe que lideram.
    const gerenteAutorIds = Array.from(
      new Set(
        upcoming
          .filter((i) => i.autor.role === Role.gerente)
          .map((i) => i.autorId),
      ),
    );
    const equipeByGerenteId =
      await this.resolveEquipeByGerenteIds(gerenteAutorIds);

    type Urgencia = 'nenhuma' | 'dia' | 'duas_horas' | 'uma_hora';
    let urgencia: Urgencia = 'nenhuma';

    const proximos = upcoming.map((item) => {
      const startsAt = new Date(item.startsAt);
      const msRestante = startsAt.getTime() - now.getTime();
      let nivel: 'dia' | 'duas_horas' | 'uma_hora' = 'dia';
      if (msRestante <= MS_1H) nivel = 'uma_hora';
      else if (msRestante <= MS_2H) nivel = 'duas_horas';

      if (nivel === 'uma_hora') urgencia = 'uma_hora';
      else if (nivel === 'duas_horas' && urgencia !== 'uma_hora') {
        urgencia = 'duas_horas';
      } else if (urgencia === 'nenhuma') {
        urgencia = 'dia';
      }

      const corretorId =
        item.lead?.corretorId ??
        (item.autor.role === Role.corretor ? item.autorId : null);
      const corretorNome =
        item.lead?.corretor?.name ??
        (item.autor.role === Role.corretor ? item.autor.name : null);
      const info = corretorId
        ? equipeInfoByCorretorId.get(corretorId)
        : undefined;
      const equipeDoGerente =
        item.autor.role === Role.gerente
          ? equipeByGerenteId.get(item.autorId)
          : undefined;
      const equipeNome =
        info?.equipeNome ??
        equipeDoGerente?.name ??
        item.alvoEquipe?.name ??
        null;
      const publicoLabel =
        item.alvoTipo === AgendamentoAlvo.todos
          ? 'Todas as equipes'
          : item.alvoTipo === AgendamentoAlvo.equipe
            ? item.alvoEquipe?.name
              ? `Equipe: ${item.alvoEquipe.name}`
              : 'Uma equipe'
            : item.alvoTipo === AgendamentoAlvo.gerente
              ? item.alvoGerente?.name
                ? `Gerente: ${item.alvoGerente.name}`
                : 'Um gerente'
              : null;

      return {
        id: item.id,
        titulo: item.titulo,
        startsAt: item.startsAt,
        local: item.local,
        leadNome: item.lead?.nome ?? null,
        leadTipo: item.lead?.tipo ?? null,
        corretorNome,
        gerenteNome:
          (info?.gerenteNome ? info.gerenteNome : null) ??
          (item.autor.role === Role.gerente ? item.autor.name : null) ??
          item.alvoGerente?.name ??
          null,
        equipeNome,
        publicoLabel,
        autorNome: item.autor.name,
        autorRole: item.autor.role,
        nivel,
        msRestante,
      };
    });

    const criadas: Array<{
      id: string;
      tipo: NotificacaoTipo;
      titulo: string;
      corpo: string;
    }> = [];

    const tomInformativo = requester.role === Role.admin;

    for (const item of upcoming) {
      const startsAt = new Date(item.startsAt);
      const msRestante = startsAt.getTime() - now.getTime();
      if (msRestante <= 0) continue;

      const quando = startsAt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      const proximo = proximos.find((p) => p.id === item.id);
      const envolvidos: string[] = [];
      if (proximo?.publicoLabel) {
        envolvidos.push(proximo.publicoLabel);
      }
      if (proximo?.leadNome) {
        envolvidos.push(
          `${proximo.leadTipo === 'cliente' ? 'Cliente' : 'Lead'}: ${proximo.leadNome}`,
        );
      }
      if (proximo?.corretorNome) {
        envolvidos.push(`Corretor: ${proximo.corretorNome}`);
      }
      if (proximo?.gerenteNome && !proximo.publicoLabel?.startsWith('Gerente:')) {
        envolvidos.push(`Gerente: ${proximo.gerenteNome}`);
      }
      if (proximo?.equipeNome && !proximo.publicoLabel?.startsWith('Equipe:')) {
        envolvidos.push(`Equipe: ${proximo.equipeNome}`);
      }
      const envolvidosTxt =
        envolvidos.length > 0 ? ` — ${envolvidos.join(' · ')}` : '';

      const janelas: Array<{
        maxMs: number;
        tipo:
          | typeof NotificacaoTipo.agenda_lembrete_1d
          | typeof NotificacaoTipo.agenda_lembrete_2h
          | typeof NotificacaoTipo.agenda_lembrete_1h;
      }> = [
        { maxMs: MS_1D, tipo: NotificacaoTipo.agenda_lembrete_1d },
        { maxMs: MS_2H, tipo: NotificacaoTipo.agenda_lembrete_2h },
        { maxMs: MS_1H, tipo: NotificacaoTipo.agenda_lembrete_1h },
      ];

      for (const janela of janelas) {
        if (msRestante > janela.maxMs) continue;
        const created = await this.notificacoes.createAgendaLembrete({
          userId: requester.id,
          agendamentoId: item.id,
          leadId: item.leadId,
          titulo: item.titulo,
          quando,
          envolvidos: envolvidosTxt || undefined,
          tomInformativo,
          tipo: janela.tipo,
        });
        if (created) {
          criadas.push({
            id: created.id,
            tipo: created.tipo,
            titulo: created.titulo,
            corpo: created.corpo,
          });
        }
      }
    }

    const solicitacoes = await this.countSolicitacoes(requester);

    return {
      urgencia,
      proximosCount: proximos.length,
      solicitacoesCount: solicitacoes.count,
      proximos,
      novasNotificacoes: criadas.filter(Boolean),
    };
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const item = await this.prisma.agendamento.findUnique({
      where: { id },
      select: agendamentoSelect,
    });
    if (!item) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(item, requester);
    return item;
  }

  async create(dto: CreateAgendamentoDto, requester: AuthenticatedUser) {
    const escopo = dto.escopo as AgendamentoEscopo;
    const leadId = dto.leadId?.trim() || null;
    const alvo = await this.resolveAlvoOnCreate(dto, requester);

    if (
      alvo.alvoTipo === AgendamentoAlvo.nenhum &&
      escopo === AgendamentoEscopo.com_gerente &&
      !leadId
    ) {
      throw new BadRequestException(
        'Selecione um lead ou cliente para compromissos com o gerente.',
      );
    }

    const lead = leadId
      ? await this.ensureLeadAccessible(leadId, requester)
      : null;

    const startsAt = new Date(dto.startsAt);
    const endsAt = this.parseOptionalDate(dto.endsAt);
    this.assertTimeRange(startsAt, endsAt);

    const needsApproval =
      alvo.alvoTipo === AgendamentoAlvo.nenhum &&
      escopo === AgendamentoEscopo.com_gerente &&
      requester.role === Role.corretor;

    const solicitacaoStatus = needsApproval
      ? AgendamentoSolicitacaoStatus.pendente
      : escopo === AgendamentoEscopo.com_gerente &&
          alvo.alvoTipo === AgendamentoAlvo.nenhum
        ? AgendamentoSolicitacaoStatus.aprovada
        : AgendamentoSolicitacaoStatus.nenhuma;

    const created = await this.prisma.agendamento.create({
      data: {
        leadId: lead?.id ?? null,
        autorId: requester.id,
        titulo: dto.titulo.trim(),
        tipo: dto.tipo as AgendamentoTipo,
        escopo,
        solicitacaoStatus,
        status: AgendamentoStatus.agendado,
        alvoTipo: alvo.alvoTipo,
        alvoEquipeId: alvo.alvoEquipeId,
        alvoGerenteId: alvo.alvoGerenteId,
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

    if (needsApproval && lead) {
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
      lead &&
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
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        autor: { select: { role: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(existing, requester);
    this.assertCanModifyAgendamento(existing, requester);

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
    if (dto.status !== undefined) {
      data.status = dto.status as AgendamentoStatus;
      // Cancelar um compromisso pendente encerra a solicitação.
      if (
        dto.status === AgendamentoStatus.cancelado &&
        existing.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente
      ) {
        data.solicitacaoStatus = AgendamentoSolicitacaoStatus.recusada;
        data.motivoRecusa = 'Cancelado pelo autor.';
      }
    }
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.local !== undefined) data.local = dto.local?.trim() || null;
    if (dto.observacoes !== undefined) {
      data.observacoes = dto.observacoes?.trim() || null;
    }

    if (
      dto.alvoTipo !== undefined ||
      dto.alvoEquipeId !== undefined ||
      dto.alvoGerenteId !== undefined
    ) {
      const alvo = await this.resolveAlvoOnUpdate(dto, existing, requester);
      data.alvoTipo = alvo.alvoTipo;
      data.alvoEquipe = alvo.alvoEquipeId
        ? { connect: { id: alvo.alvoEquipeId } }
        : { disconnect: true };
      data.alvoGerente = alvo.alvoGerenteId
        ? { connect: { id: alvo.alvoGerenteId } }
        : { disconnect: true };
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
    await this.ensureAgendamentoAccessible(existing, requester);

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
      existing.leadId &&
      existing.lead &&
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
    await this.ensureAgendamentoAccessible(existing, requester);

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
      select: {
        id: true,
        leadId: true,
        autorId: true,
        escopo: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        autor: { select: { role: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(existing, requester);
    this.assertCanModifyAgendamento(existing, requester);
    this.assertCanModifyAgendamento(existing, requester);

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

  /**
   * Acesso a compromissos compartilhados (com gerente): leads no escopo da equipe.
   * Tarefas pessoais não entram aqui — só o autor as vê.
   */
  private async buildSharedAccessFilter(
    requester: AuthenticatedUser,
    filterCorretorId?: string,
    filterEquipeId?: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(await this.teamScope.leadScope(requester)),
    };

    if (filterEquipeId && requester.role !== Role.corretor) {
      const equipe = await this.prisma.equipe.findUnique({
        where: { id: filterEquipeId },
        select: {
          id: true,
          gerenteId: true,
          membros: { select: { id: true } },
        },
      });
      if (!equipe) return null;
      if (
        requester.role === Role.gerente &&
        equipe.gerenteId !== requester.id
      ) {
        return null;
      }

      const memberIds = [
        equipe.gerenteId,
        ...equipe.membros.map((m) => m.id),
      ];

      if (filterCorretorId) {
        if (!memberIds.includes(filterCorretorId)) return null;
        const allowed = await this.teamScope.canAccessCorretor(
          requester,
          filterCorretorId,
        );
        if (!allowed) return null;
        leadFilter.corretorId = filterCorretorId;
      } else {
        leadFilter.corretorId = { in: memberIds };
      }

      return { lead: leadFilter };
    }

    if (filterCorretorId && requester.role !== Role.corretor) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        filterCorretorId,
      );
      if (!allowed) return null;
      leadFilter.corretorId = filterCorretorId;
    }

    return { lead: leadFilter };
  }

  /**
   * Visibilidade de eventos do admin (alvoTipo != nenhum).
   * Admin sempre vê; demais conforme todos / equipe / gerente.
   */
  private async buildAdminEventVisibility(
    requester: AuthenticatedUser,
    filterEquipeId?: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    if (requester.role === Role.admin) {
      if (!filterEquipeId) {
        return {
          alvoTipo: {
            in: [
              AgendamentoAlvo.todos,
              AgendamentoAlvo.equipe,
              AgendamentoAlvo.gerente,
            ],
          },
        };
      }

      const equipe = await this.prisma.equipe.findUnique({
        where: { id: filterEquipeId },
        select: { id: true, gerenteId: true },
      });
      if (!equipe) return null;

      return {
        OR: [
          { alvoTipo: AgendamentoAlvo.todos },
          {
            alvoTipo: AgendamentoAlvo.equipe,
            alvoEquipeId: filterEquipeId,
          },
          {
            alvoTipo: AgendamentoAlvo.gerente,
            alvoGerenteId: equipe.gerenteId,
          },
        ],
      };
    }

    const clauses: Prisma.AgendamentoWhereInput[] = [
      { alvoTipo: AgendamentoAlvo.todos },
    ];

    if (requester.role === Role.gerente) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { gerenteId: requester.id },
        select: { id: true },
      });
      if (equipe) {
        clauses.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: equipe.id,
        });
      }
      clauses.push({
        alvoTipo: AgendamentoAlvo.gerente,
        alvoGerenteId: requester.id,
      });
    } else if (requester.role === Role.corretor) {
      const user = await this.prisma.user.findUnique({
        where: { id: requester.id },
        select: { equipeId: true },
      });
      if (user?.equipeId) {
        clauses.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: user.equipeId,
        });
      }
    }

    return { OR: clauses };
  }

  private async resolveAlvoOnCreate(
    dto: CreateAgendamentoDto,
    requester: AuthenticatedUser,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (requester.role !== Role.admin) {
      return {
        alvoTipo: AgendamentoAlvo.nenhum,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    const tipo = (dto.alvoTipo as AgendamentoAlvo | undefined) ?? AgendamentoAlvo.todos;
    if (tipo === AgendamentoAlvo.nenhum) {
      return {
        alvoTipo: AgendamentoAlvo.todos,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    return this.assertAndNormalizeAlvo(
      tipo,
      dto.alvoEquipeId,
      dto.alvoGerenteId,
    );
  }

  private async resolveAlvoOnUpdate(
    dto: UpdateAgendamentoDto,
    existing: {
      alvoTipo: AgendamentoAlvo;
      alvoEquipeId: string | null;
      alvoGerenteId: string | null;
    },
    requester: AuthenticatedUser,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar o público do evento.',
      );
    }

    const tipo =
      (dto.alvoTipo as AgendamentoAlvo | undefined) ?? existing.alvoTipo;
    if (tipo === AgendamentoAlvo.nenhum) {
      throw new BadRequestException(
        'Eventos do admin devem ter público: todos, equipe ou gerente.',
      );
    }

    const equipeId =
      dto.alvoEquipeId !== undefined
        ? dto.alvoEquipeId?.trim() || null
        : existing.alvoEquipeId;
    const gerenteId =
      dto.alvoGerenteId !== undefined
        ? dto.alvoGerenteId?.trim() || null
        : existing.alvoGerenteId;

    return this.assertAndNormalizeAlvo(tipo, equipeId, gerenteId);
  }

  private async assertAndNormalizeAlvo(
    tipo: AgendamentoAlvo,
    alvoEquipeId?: string | null,
    alvoGerenteId?: string | null,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (tipo === AgendamentoAlvo.todos) {
      return {
        alvoTipo: AgendamentoAlvo.todos,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    if (tipo === AgendamentoAlvo.equipe) {
      const id = alvoEquipeId?.trim();
      if (!id) {
        throw new BadRequestException('Selecione a equipe do evento.');
      }
      const equipe = await this.prisma.equipe.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!equipe) {
        throw new BadRequestException('Equipe não encontrada.');
      }
      return {
        alvoTipo: AgendamentoAlvo.equipe,
        alvoEquipeId: equipe.id,
        alvoGerenteId: null,
      };
    }

    if (tipo === AgendamentoAlvo.gerente) {
      const id = alvoGerenteId?.trim();
      if (!id) {
        throw new BadRequestException('Selecione o gerente do evento.');
      }
      const gerente = await this.prisma.user.findFirst({
        where: { id, role: Role.gerente, status: UserStatus.ativo },
        select: { id: true },
      });
      if (!gerente) {
        throw new BadRequestException('Gerente não encontrado.');
      }
      return {
        alvoTipo: AgendamentoAlvo.gerente,
        alvoEquipeId: null,
        alvoGerenteId: gerente.id,
      };
    }

    throw new BadRequestException('Público do evento inválido.');
  }

  private async ensureAgendamentoAccessible(
    item: {
      leadId: string | null;
      autorId: string;
      escopo?: AgendamentoEscopo;
      alvoTipo?: AgendamentoAlvo;
      alvoEquipeId?: string | null;
      alvoGerenteId?: string | null;
      autor?: { role: Role } | null;
    },
    requester: AuthenticatedUser,
  ) {
    const alvoTipo = item.alvoTipo ?? AgendamentoAlvo.nenhum;

    if (alvoTipo !== AgendamentoAlvo.nenhum) {
      if (requester.role === Role.admin) return;
      if (alvoTipo === AgendamentoAlvo.todos) return;
      if (
        alvoTipo === AgendamentoAlvo.gerente &&
        item.alvoGerenteId === requester.id
      ) {
        return;
      }
      if (alvoTipo === AgendamentoAlvo.equipe && item.alvoEquipeId) {
        if (requester.role === Role.gerente) {
          const equipe = await this.prisma.equipe.findFirst({
            where: { id: item.alvoEquipeId, gerenteId: requester.id },
            select: { id: true },
          });
          if (equipe) return;
        }
        if (requester.role === Role.corretor) {
          const user = await this.prisma.user.findUnique({
            where: { id: requester.id },
            select: { equipeId: true },
          });
          if (user?.equipeId === item.alvoEquipeId) return;
        }
      }
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const autorRole =
      item.autor?.role ??
      (
        await this.prisma.user.findUnique({
          where: { id: item.autorId },
          select: { role: true },
        })
      )?.role;

    // Compromissos legados criados por admin sem alvo: visíveis para todos.
    if (autorRole === Role.admin) {
      return;
    }

    // Tarefa pessoal: somente o autor (admin também, para suporte).
    if (item.escopo === AgendamentoEscopo.pessoal) {
      if (
        item.autorId === requester.id ||
        requester.role === Role.admin
      ) {
        return;
      }
      throw new NotFoundException('Agendamento não encontrado.');
    }

    if (item.leadId) {
      await this.ensureLeadAccessible(item.leadId, requester);
      return;
    }

    if (requester.role === Role.admin || item.autorId === requester.id) {
      return;
    }

    throw new NotFoundException('Agendamento não encontrado.');
  }

  /** Compromissos do admin só podem ser alterados por admin. */
  private assertCanModifyAgendamento(
    item: {
      autorId: string;
      autor?: { role: Role } | null;
    },
    requester: AuthenticatedUser,
  ) {
    if (item.autor?.role === Role.admin && requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar compromissos da equipe.',
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

  /** Mapa corretorId → gerente e nome da equipe. */
  private async resolveEquipeInfoByCorretorIds(
    corretorIds: string[],
  ): Promise<Map<string, { gerenteNome: string; equipeNome: string }>> {
    const map = new Map<
      string,
      { gerenteNome: string; equipeNome: string }
    >();
    if (corretorIds.length === 0) return map;

    const corretores = await this.prisma.user.findMany({
      where: { id: { in: corretorIds } },
      select: {
        id: true,
        equipe: {
          select: {
            name: true,
            gerente: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const c of corretores) {
      if (c.equipe?.name && c.equipe.gerente?.name) {
        map.set(c.id, {
          equipeNome: c.equipe.name,
          gerenteNome: c.equipe.gerente.name,
        });
      } else if (c.equipe?.name) {
        map.set(c.id, {
          equipeNome: c.equipe.name,
          gerenteNome: '',
        });
      }
    }
    return map;
  }

  private async resolveEquipeByGerenteIds(
    gerenteIds: string[],
  ): Promise<Map<string, { name: string }>> {
    const map = new Map<string, { name: string }>();
    if (gerenteIds.length === 0) return map;

    const equipes = await this.prisma.equipe.findMany({
      where: { gerenteId: { in: gerenteIds } },
      select: { name: true, gerenteId: true },
    });
    for (const e of equipes) {
      map.set(e.gerenteId, { name: e.name });
    }
    return map;
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
