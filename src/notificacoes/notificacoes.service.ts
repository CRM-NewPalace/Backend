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
    const parecer =
      params.parecer?.trim()
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
}
