import { Injectable } from '@nestjs/common';
import { AnaliseStatus, ContatoTipo, DocumentacaoStatus2 } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async resumoCorretor(requester: AuthenticatedUser) {
    const now = new Date();
    const inicioMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const inicioProximoMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    // Recife não usa horário de verão; a agenda deve respeitar o dia local do corretor.
    const recifeAgora = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const inicioHoje = new Date(
      Date.UTC(
        recifeAgora.getUTCFullYear(),
        recifeAgora.getUTCMonth(),
        recifeAgora.getUTCDate(),
        3,
      ),
    );
    const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);
    const leadWhere = { corretorId: requester.id, perdidoAt: null };

    const [
      carteira,
      novosContatos,
      funil,
      analises,
      documentacoes,
      vgvVendido,
      agendaHoje,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['tipo'],
        where: leadWhere,
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          createdAt: { gte: inicioMes, lt: inicioProximoMes },
        },
      }),
      this.prisma.lead.groupBy({
        by: ['stage'],
        where: leadWhere,
        _count: { _all: true },
      }),
      this.prisma.analise.groupBy({
        by: ['status'],
        where: { lead: leadWhere },
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: { lead: leadWhere },
        _count: { _all: true },
      }),
      this.prisma.documentacao.aggregate({
        where: {
          lead: leadWhere,
          status2: DocumentacaoStatus2.vendido,
          dataVenda: { gte: inicioMes, lt: inicioProximoMes },
        },
        _sum: { vgv: true },
      }),
      this.prisma.agendamento.findMany({
        where: {
          autorId: requester.id,
          startsAt: { gte: inicioHoje, lt: inicioAmanha },
          status: { not: 'cancelado' },
        },
        select: {
          id: true,
          titulo: true,
          tipo: true,
          status: true,
          startsAt: true,
          lead: { select: { nome: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const totalPorTipo = new Map(
      carteira.map((item) => [item.tipo, item._count._all]),
    );
    const totalLeads = totalPorTipo.get(ContatoTipo.lead) ?? 0;
    const totalClientes = totalPorTipo.get(ContatoTipo.cliente) ?? 0;
    const totalCarteira = totalLeads + totalClientes;
    const emAnalise =
      funil.find((item) => item.stage === 'em-analise')?._count._all ?? 0;

    return {
      periodo: {
        inicio: inicioMes.toISOString(),
        fim: inicioProximoMes.toISOString(),
      },
      carteira: {
        leads: totalLeads,
        clientes: totalClientes,
        novosContatos,
      },
      funil: funil.map((item) => ({
        etapa: item.stage,
        total: item._count._all,
      })),
      conversaoEmAnalise: totalCarteira
        ? Number(((emAnalise / totalCarteira) * 100).toFixed(1))
        : 0,
      analises: Object.values(AnaliseStatus).map((status) => ({
        status,
        total:
          analises.find((item) => item.status === status)?._count._all ?? 0,
      })),
      documentacao: {
        registrados: documentacoes.reduce(
          (total, item) => total + item._count._all,
          0,
        ),
        vendidos:
          documentacoes.find(
            (item) => item.status2 === DocumentacaoStatus2.vendido,
          )?._count._all ?? 0,
        emAndamento:
          documentacoes.find(
            (item) => item.status2 === DocumentacaoStatus2.andamento,
          )?._count._all ?? 0,
        vgvVendidoMes: vgvVendido._sum.vgv ?? 0,
      },
      agenda: {
        totalHoje: agendaHoje.length,
        pendentesHoje: agendaHoje.filter(
          (item) => item.status === 'agendado',
        ).length,
        concluidosHoje: agendaHoje.filter(
          (item) => item.status === 'concluido',
        ).length,
        itens: agendaHoje.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          tipo: item.tipo,
          status: item.status,
          startsAt: item.startsAt,
          contato: item.lead?.nome ?? null,
        })),
      },
    };
  }
}
