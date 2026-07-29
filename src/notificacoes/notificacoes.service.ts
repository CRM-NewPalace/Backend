import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificacaoTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const notifSelect = {
  id: true,
  tipo: true,
  titulo: true,
  corpo: true,
  lida: true,
  leadId: true,
  analiseId: true,
  agendamentoId: true,
  createdAt: true,
} satisfies Prisma.NotificacaoSelect;

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  list(requester: AuthenticatedUser) {
    return this.prisma.notificacao.findMany({
      where: { userId: requester.id },
      select: notifSelect,
      orderBy: [{ lida: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  async markRead(id: string, requester: AuthenticatedUser) {
    const item = await this.prisma.notificacao.findFirst({
      where: { id, userId: requester.id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    return this.prisma.notificacao.update({
      where: { id },
      data: { lida: true },
      select: notifSelect,
    });
  }

  async markAllRead(requester: AuthenticatedUser) {
    await this.prisma.notificacao.updateMany({
      where: { userId: requester.id, lida: false },
      data: { lida: true },
    });
    return { ok: true };
  }

  /** Cria aviso de resultado de análise para o corretor dono do lead. */
  async createAnaliseResultado(params: {
    userId: string;
    leadId: string;
    analiseId: string;
    nomeProcesso: string;
    status: 'aprovado' | 'reprovado';
    parecer?: string | null;
  }) {
    const statusLabel =
      params.status === 'aprovado' ? 'aprovada' : 'reprovada';
    const parecer = params.parecer?.trim()
      ? ` Parecer: ${params.parecer.trim().slice(0, 280)}`
      : '';

    return this.prisma.notificacao.create({
      data: {
        userId: params.userId,
        tipo: NotificacaoTipo.analise_resultado,
        titulo: `Análise ${statusLabel} — ${params.nomeProcesso}`,
        corpo: `O resultado da análise de ${params.nomeProcesso} foi ${statusLabel}.${parecer}`,
        leadId: params.leadId,
        analiseId: params.analiseId,
      },
      select: notifSelect,
    });
  }

  /** Avisa o gerente sobre nova solicitação de agenda do corretor. */
  async createAgendaSolicitacao(params: {
    userId: string;
    agendamentoId: string;
    leadId: string;
    titulo: string;
    autorNome: string;
    quando: string;
  }) {
    return this.prisma.notificacao.create({
      data: {
        userId: params.userId,
        tipo: NotificacaoTipo.agenda_solicitacao,
        titulo: `Solicitação de agenda — ${params.titulo}`,
        corpo: `${params.autorNome} pediu aprovação para "${params.titulo}" em ${params.quando}.`,
        leadId: params.leadId,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /** Avisa o corretor sobre aprovação/recusa da solicitação. */
  async createAgendaResposta(params: {
    userId: string;
    agendamentoId: string;
    leadId?: string | null;
    titulo: string;
    aprovado: boolean;
    motivo?: string;
  }) {
    const motivo =
      !params.aprovado && params.motivo
        ? ` Motivo: ${params.motivo.slice(0, 280)}`
        : '';
    return this.prisma.notificacao.create({
      data: {
        userId: params.userId,
        tipo: NotificacaoTipo.agenda_resposta,
        titulo: params.aprovado
          ? `Agenda aprovada — ${params.titulo}`
          : `Agenda recusada — ${params.titulo}`,
        corpo: params.aprovado
          ? `Sua solicitação "${params.titulo}" foi aprovada pelo gerente.`
          : `Sua solicitação "${params.titulo}" foi recusada.${motivo}`,
        leadId: params.leadId ?? null,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /** Lembrete de compromisso próximo (1 dia / 2h / 1h). Idempotente por tipo+agendamento. */
  async createAgendaLembrete(params: {
    userId: string;
    agendamentoId: string;
    leadId?: string | null;
    titulo: string;
    quando: string;
    /** Ex.: " — Cliente: X · Corretor: Y · Gerente: Z" */
    envolvidos?: string;
    /** Tom neutro para admin (sem sugerir que o compromisso é dele). */
    tomInformativo?: boolean;
    tipo:
      | typeof NotificacaoTipo.agenda_lembrete_1d
      | typeof NotificacaoTipo.agenda_lembrete_2h
      | typeof NotificacaoTipo.agenda_lembrete_1h;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        agendamentoId: params.agendamentoId,
        tipo: params.tipo,
      },
      select: { id: true },
    });
    if (existing) return null;

    const janela =
      params.tipo === NotificacaoTipo.agenda_lembrete_1h
        ? '1 hora'
        : params.tipo === NotificacaoTipo.agenda_lembrete_2h
          ? '2 horas'
          : '1 dia';

    const envolvidos = params.envolvidos?.trim() ?? '';
    const titulo = params.tomInformativo
      ? `Agenda da equipe — ${params.titulo}`
      : `Lembrete (${janela}) — ${params.titulo}`;
    const corpo = params.tomInformativo
      ? `Aviso informativo: compromisso da equipe "${params.titulo}"${envolvidos} em ${params.quando}.`
      : `Seu compromisso "${params.titulo}"${envolvidos} começa em ${params.quando}.`;

    return this.prisma.notificacao.create({
      data: {
        userId: params.userId,
        tipo: params.tipo,
        titulo,
        corpo,
        leadId: params.leadId ?? null,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }
}
