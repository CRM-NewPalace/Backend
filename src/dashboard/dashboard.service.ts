import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AgendamentoAlvo,
  AgendamentoEscopo,
  AgendamentoStatus,
  AgendamentoTipo,
  AnaliseStatus,
  ContatoTipo,
  FunilEtapaPapel,
  MetaPeriodo,
  MetaTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  countStatusAndamento,
  countStatusVendido,
  documentacaoPipelineStatusKey,
  isStatusVendido,
  status2VendidoWhere,
  sumVgvVendido,
} from '../common/utils/documentacao-status';
import { requireTenantId } from '../common/utils/tenant';
import { AgendaService } from '../agenda/agenda.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { FunisService } from '../funis/funis.service';
import { PrismaService } from '../prisma/prisma.service';

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIAS_PARADO_DEFAULT = 7;

type Periodo = { inicio: Date; fim: Date };

function evolucaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}

function metric(atual: number, anterior: number) {
  return {
    valor: atual,
    valorMesAnterior: anterior,
    evolucaoPct: evolucaoPct(atual, anterior),
  };
}


type JanelasOpts = {
  /** Mês 1–12. Omite = mês corrente (BR). */
  mes?: number;
  /** Ano calendário. Omite = ano corrente (BR). */
  ano?: number;
  now?: Date;
};

function janelasBrasil(opts: JanelasOpts = {}) {
  const now = opts.now ?? new Date();
  const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
  const realY = brasil.getUTCFullYear();
  const realM = brasil.getUTCMonth();
  const d = brasil.getUTCDate();
  const dow = brasil.getUTCDay();
  const mondayOffset = (dow + 6) % 7;

  const y = opts.ano ?? realY;
  const m = opts.mes != null ? opts.mes - 1 : realM;

  const toInstant = (yy: number, mm: number, dd: number) =>
    new Date(Date.UTC(yy, mm, dd) + BRASIL_UTC_OFFSET_MS);

  const inicioHoje = toInstant(realY, realM, d);
  const inicioAmanha = toInstant(realY, realM, d + 1);
  const inicioSemana = toInstant(realY, realM, d - mondayOffset);
  const inicioMesAtual = toInstant(y, m, 1);
  const inicioProximoMes = toInstant(y, m + 1, 1);
  const inicioMesAnterior = toInstant(y, m - 1, 1);

  return {
    agora: now,
    inicioHoje,
    inicioAmanha,
    inicioSemana,
    ano: y,
    mes: m,
    mesAtual: { inicio: inicioMesAtual, fim: inicioProximoMes } satisfies Periodo,
    mesAnterior: {
      inicio: inicioMesAnterior,
      fim: inicioMesAtual,
    } satisfies Periodo,
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agendaService: AgendaService,
    private readonly teamScope: TeamScopeService,
    private readonly funis: FunisService,
  ) {}

  async resumoCorretor(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const now = new Date();
    const inicioMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const inicioProximoMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const recifeAgora = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const inicioHoje = new Date(
      Date.UTC(
        recifeAgora.getUTCFullYear(),
        recifeAgora.getUTCMonth(),
        recifeAgora.getUTCDate(),
        3,
      ),
    );
    const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);
    const leadWhere = { tenantId, corretorId: requester.id, perdidoAt: null };

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
        where: { tenantId, lead: leadWhere },
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: { tenantId, lead: leadWhere },
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: {
          tenantId,
          lead: leadWhere,
          dataVenda: { gte: inicioMes, lt: inicioProximoMes },
        },
        _sum: { vgv: true },
      }),
      this.agendaService.list(
        {
          from: inicioHoje.toISOString(),
          to: new Date(inicioAmanha.getTime() - 1).toISOString(),
        },
        requester,
      ),
    ]);

    const totalPorTipo = new Map(
      carteira.map((item) => [item.tipo, item._count._all]),
    );
    const totalLeads = totalPorTipo.get(ContatoTipo.lead) ?? 0;
    const totalClientes = totalPorTipo.get(ContatoTipo.cliente) ?? 0;
    const totalCarteira = totalLeads + totalClientes;
    const analiseSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.analise,
    );
    const emAnalise = analiseSlug
      ? (funil.find((item) => item.stage === analiseSlug)?._count._all ?? 0)
      : 0;
    const agendaAtiva = agendaHoje.filter(
      (item) => item.status !== 'cancelado',
    );

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
        vendidos: countStatusVendido(documentacoes),
        emAndamento: countStatusAndamento(documentacoes),
        vgvVendidoMes: sumVgvVendido(vgvVendido),
      },
      agenda: {
        totalHoje: agendaAtiva.length,
        pendentesHoje: agendaAtiva.filter(
          (item) => item.status === 'agendado',
        ).length,
        concluidosHoje: agendaAtiva.filter(
          (item) => item.status === 'concluido',
        ).length,
        itens: agendaAtiva.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          tipo: item.tipo,
          status: item.status,
          startsAt: item.startsAt,
          contato: item.lead?.nome ?? null,
          categoria:
            item.escopo === AgendamentoEscopo.com_gerente ||
            item.alvoTipo !== AgendamentoAlvo.nenhum
              ? 'compartilhada'
              : 'pessoal',
        })),
      },
    };
  }

  async resumoAdmin(
    requester: AuthenticatedUser,
    filtros: { mes?: number; ano?: number; origem?: string } = {},
  ) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Dashboard gerencial disponível para admin e gerente.',
      );
    }

    const tenantId = requireTenantId(requester);
    const windows = janelasBrasil({ mes: filtros.mes, ano: filtros.ano });
    const { mesAtual, mesAnterior, inicioHoje, inicioAmanha, inicioSemana } =
      windows;
    const origem = filtros.origem?.trim() || undefined;
    const origemWhere = origem ? { origem } : {};
    const diasParado = DIAS_PARADO_DEFAULT;
    const paradoAntes = new Date(
      windows.agora.getTime() - diasParado * 24 * 60 * 60 * 1000,
    );

    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const leadAtivoWhere = {
      tenantId,
      perdidoAt: null as null,
      ...origemWhere,
      ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
    };
    const leadCriadoWhere = (periodo: Periodo) => ({
      tenantId,
      createdAt: { gte: periodo.inicio, lt: periodo.fim },
      ...origemWhere,
      ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
    });
    const vendaSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    /** Leads que entraram no período e já viraram venda (coorte). */
    const leadVendidoDaEntradaWhere = (periodo: Periodo) => ({
      ...leadCriadoWhere(periodo),
      OR: [
        ...(vendaSlug ? [{ stage: vendaSlug }] : []),
        {
          documentacoes: {
            some: status2VendidoWhere(),
          },
        },
      ],
    });
    const docVendaWhere = (periodo: Periodo) => ({
      tenantId,
      dataVenda: { gte: periodo.inicio, lt: periodo.fim },
      ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
      ...(origem ? { lead: { origem } } : {}),
    });
    const docPipelineWhere = (periodo: Periodo) => ({
      tenantId,
      createdAt: { gte: periodo.inicio, lt: periodo.fim },
      lead: {
        ...(origem ? { origem } : {}),
        ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
      },
    });
    const perdidoWhere = (periodo: Periodo) => ({
      tenantId,
      perdidoAt: { gte: periodo.inicio, lt: periodo.fim },
      ...origemWhere,
      ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
    });

    const [
      funil,
      entradasHoje,
      entradasSemana,
      entradasMes,
      entradasMesAnt,
      semDono,
      parados,
      perdidosMes,
      perdidosMesAnt,
      perdidosMotivos,
      perdidosMotivosAnt,
      vendasDaEntradaMes,
      vendasDaEntradaMesAnt,
      vgvMes,
      vgvMesAnt,
      documentacaoStatusMes,
      documentacaoStatusMesAnt,
      agendaHoje,
      agendaAtrasados,
      corretores,
      equipes,
      metasAtivas,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['stage'],
        where: leadAtivoWhere,
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: leadCriadoWhere({ inicio: inicioHoje, fim: inicioAmanha }),
      }),
      this.prisma.lead.count({
        where: leadCriadoWhere({ inicio: inicioSemana, fim: inicioAmanha }),
      }),
      this.prisma.lead.count({ where: leadCriadoWhere(mesAtual) }),
      this.prisma.lead.count({ where: leadCriadoWhere(mesAnterior) }),
      this.prisma.lead.count({
        where: {
          tenantId,
          perdidoAt: null,
          corretorId: null,
          ...origemWhere,
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadAtivoWhere,
          updatedAt: { lt: paradoAntes },
        },
      }),
      this.prisma.lead.count({
        where: perdidoWhere(mesAtual),
      }),
      this.prisma.lead.count({
        where: perdidoWhere(mesAnterior),
      }),
      this.prisma.lead.groupBy({
        by: ['motivoPerda'],
        where: {
          ...perdidoWhere(mesAtual),
          motivoPerda: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { motivoPerda: 'desc' } },
        take: 5,
      }),
      this.prisma.lead.groupBy({
        by: ['motivoPerda'],
        where: {
          ...perdidoWhere(mesAnterior),
          motivoPerda: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: leadVendidoDaEntradaWhere(mesAtual),
      }),
      this.prisma.lead.count({
        where: leadVendidoDaEntradaWhere(mesAnterior),
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: docVendaWhere(mesAtual),
        _sum: { vgv: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: docVendaWhere(mesAnterior),
        _sum: { vgv: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status1'],
        where: docPipelineWhere(mesAtual),
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status1'],
        where: docPipelineWhere(mesAnterior),
        _count: { _all: true },
      }),
      this.prisma.agendamento.findMany({
        where: {
          tenantId,
          startsAt: { gte: inicioHoje, lt: inicioAmanha },
          status: { not: AgendamentoStatus.cancelado },
          ...(corretorIds ? { autorId: { in: corretorIds } } : {}),
          ...(origem ? { lead: { origem } } : {}),
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
        take: 20,
      }),
      this.prisma.agendamento.count({
        where: {
          tenantId,
          status: AgendamentoStatus.agendado,
          startsAt: { lt: windows.agora },
          ...(corretorIds ? { autorId: { in: corretorIds } } : {}),
          ...(origem ? { lead: { origem } } : {}),
        },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: Role.corretor,
          status: UserStatus.ativo,
          ...(corretorIds ? { id: { in: corretorIds } } : {}),
        },
        select: {
          id: true,
          name: true,
          equipeId: true,
          equipe: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.equipe.findMany({
        where: {
          tenantId,
          status: UserStatus.ativo,
          ...(corretorIds
            ? { membros: { some: { id: { in: corretorIds } } } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          membros: {
            where: { role: Role.corretor, status: UserStatus.ativo },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.meta.findMany({
        where: {
          tenantId,
          escopo: 'corretor',
          inicio: { lte: windows.agora },
          fim: { gt: windows.agora },
          periodo: MetaPeriodo.mensal,
          ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
        },
        include: {
          corretor: {
            select: {
              id: true,
              name: true,
              equipeId: true,
              equipe: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const motivosAntMap = new Map(
      perdidosMotivosAnt.map((item) => [
        item.motivoPerda ?? 'Sem motivo',
        item._count._all,
      ]),
    );
    const pipelineCounts = (
      rows: Array<{ status1: string; _count: { _all: number } }>,
    ) =>
      rows.reduce(
        (acc, row) => {
          const key = documentacaoPipelineStatusKey(row.status1);
          if (key) acc[key] += row._count._all;
          return acc;
        },
        { aprovadas: 0, reprovadas: 0, emAnalise: 0 },
      );
    const pipelineAtual = pipelineCounts(documentacaoStatusMes);
    const pipelineAnterior = pipelineCounts(documentacaoStatusMesAnt);

    const ranking = await this.buildRanking(
      tenantId,
      corretores,
      mesAtual,
      mesAnterior,
      origem,
    );
    const distribuicaoEquipes = await this.buildDistribuicaoEquipes(
      tenantId,
      equipes,
      corretores.map((c) => c.id),
      origem,
    );
    const metas = await this.buildMetasProgress(tenantId, metasAtivas);

    const taxaConversao = (vendas: number, entradas: number) =>
      entradas === 0 ? 0 : Number(((vendas / entradas) * 100).toFixed(1));

    const taxaMes = taxaConversao(vendasDaEntradaMes, entradasMes);
    const taxaMesAnt = taxaConversao(
      vendasDaEntradaMesAnt,
      entradasMesAnt,
    );

    const brasilAgora = new Date(windows.agora.getTime() - BRASIL_UTC_OFFSET_MS);
    const ehMesCorrente =
      windows.ano === brasilAgora.getUTCFullYear() &&
      windows.mes === brasilAgora.getUTCMonth();
    /** Entradas/vendas/perdidos/VGV no mês filtrado. */
    const vgvMesTotal = sumVgvVendido(vgvMes);
    const vgvMesAntTotal = sumVgvVendido(vgvMesAnt);

    const temRegistroNoPeriodo =
      entradasMes > 0 ||
      vendasDaEntradaMes > 0 ||
      perdidosMes > 0 ||
      vgvMesTotal > 0;
    /**
     * Indicadores de estoque/"hoje" só fazem sentido no mês corrente com dados.
     * Em período histórico/vazio, zera para não misturar com o recorte filtrado.
     */
    const mostrarSnapshotAtual = ehMesCorrente && temRegistroNoPeriodo;

    const rankingResposta = mostrarSnapshotAtual
      ? ranking
      : ranking.map((r) => ({
          ...r,
          leads: 0,
          visitas: 0,
        }));
    const equipesResposta = mostrarSnapshotAtual
      ? distribuicaoEquipes
      : distribuicaoEquipes.map((eq) => ({
          ...eq,
          leads: 0,
          clientes: 0,
          total: 0,
        }));

    return {
      periodo: {
        mesAtual: {
          inicio: mesAtual.inicio.toISOString(),
          fim: mesAtual.fim.toISOString(),
        },
        mesAnterior: {
          inicio: mesAnterior.inicio.toISOString(),
          fim: mesAnterior.fim.toISOString(),
        },
      },
      entradas: {
        hoje: mostrarSnapshotAtual ? entradasHoje : 0,
        semana: mostrarSnapshotAtual ? entradasSemana : 0,
        mes: metric(entradasMes, entradasMesAnt),
      },
      funil: mostrarSnapshotAtual
        ? funil.map((item) => ({
            etapa: item.stage,
            total: item._count._all,
          }))
        : funil.map((item) => ({
            etapa: item.stage,
            total: 0,
          })),
      /**
       * Regra de negócio: % dos leads que entraram no período e viraram venda.
       * Coorte = createdAt no mês; venda = etapa com papel venda ou documentação vendida.
       */
      conversao: {
        entradas: metric(entradasMes, entradasMesAnt),
        vendas: metric(vendasDaEntradaMes, vendasDaEntradaMesAnt),
        taxa: metric(taxaMes, taxaMesAnt),
        vgv: metric(vgvMesTotal, vgvMesAntTotal),
      },
      documentacaoPipeline: {
        aprovadas: metric(
          pipelineAtual.aprovadas,
          pipelineAnterior.aprovadas,
        ),
        reprovadas: metric(
          pipelineAtual.reprovadas,
          pipelineAnterior.reprovadas,
        ),
        emAnalise: metric(
          pipelineAtual.emAnalise,
          pipelineAnterior.emAnalise,
        ),
        vgv: metric(vgvMesTotal, vgvMesAntTotal),
      },
      atencao: {
        semDono: mostrarSnapshotAtual ? semDono : 0,
        parados: mostrarSnapshotAtual ? parados : 0,
        diasParado,
      },
      perdidos: {
        mes: metric(perdidosMes, perdidosMesAnt),
        motivos: perdidosMotivos.map((item) => {
          const motivo = item.motivoPerda ?? 'Sem motivo';
          return {
            motivo,
            ...metric(item._count._all, motivosAntMap.get(motivo) ?? 0),
          };
        }),
      },
      agenda: mostrarSnapshotAtual
        ? {
            totalHoje: agendaHoje.length,
            pendentesHoje: agendaHoje.filter(
              (a) => a.status === AgendamentoStatus.agendado,
            ).length,
            concluidosHoje: agendaHoje.filter(
              (a) => a.status === AgendamentoStatus.concluido,
            ).length,
            atrasados: agendaAtrasados,
            itens: agendaHoje.slice(0, 8).map((item) => ({
              id: item.id,
              titulo: item.titulo,
              tipo: item.tipo,
              status: item.status,
              startsAt: item.startsAt.toISOString(),
              contato: item.lead?.nome ?? null,
            })),
          }
        : {
            totalHoje: 0,
            pendentesHoje: 0,
            concluidosHoje: 0,
            atrasados: 0,
            itens: [],
          },
      ranking: rankingResposta,
      equipes: equipesResposta,
      metas: mostrarSnapshotAtual
        ? metas
        : {
            corretores: [],
            equipes: [],
            imobiliaria: { meta: 0, atual: 0, percentual: 0 },
          },
    };
  }

  /**
   * Vendas/VGV no período alinhadas ao funil personalizado do tenant:
   * etapa com papel/label de venda ou documentação vendida.
   * `incluirEstoqueAtual`: conta leads que estão agora na etapa de venda
   * (espelha o funil; use no mês atual).
   */
  private async aggregateVendasPorCorretor(
    tenantId: string,
    corretorIds: string[],
    periodo: Periodo,
    opts?: { incluirEstoqueAtual?: boolean; origem?: string },
  ): Promise<{ vendas: Map<string, number>; vgv: Map<string, number> }> {
    const vendas = new Map<string, number>();
    const vgv = new Map<string, number>();
    if (corretorIds.length === 0) return { vendas, vgv };

    const origem = opts?.origem?.trim() || undefined;
    const origemWhere = origem ? { origem } : {};

    const vendaSlugs = await this.funis.getSlugsByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    const countedLeads = new Set<string>();

    const markSale = (
      leadId: string,
      corretorId: string | null | undefined,
    ): boolean => {
      if (!corretorId || countedLeads.has(leadId)) return false;
      countedLeads.add(leadId);
      vendas.set(corretorId, (vendas.get(corretorId) ?? 0) + 1);
      return true;
    };

    const addVgv = (
      corretorId: string | null | undefined,
      value: number | null | undefined,
    ) => {
      if (!corretorId || value == null || value === 0) return;
      vgv.set(corretorId, (vgv.get(corretorId) ?? 0) + value);
    };

    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        corretorId: { in: corretorIds },
        dataVenda: { gte: periodo.inicio, lt: periodo.fim },
        ...(origem ? { lead: { origem } } : {}),
      },
      select: { leadId: true, corretorId: true, vgv: true, status2: true },
    });
    for (const doc of docs) {
      if (!isStatusVendido(doc.status2)) continue;
      markSale(doc.leadId, doc.corretorId);
      addVgv(doc.corretorId, doc.vgv);
    }

    if (vendaSlugs.length > 0) {
      const events = await this.prisma.triagemEvent.findMany({
        where: {
          stageNovo: { in: vendaSlugs },
          createdAt: { gte: periodo.inicio, lt: periodo.fim },
          lead: { tenantId, corretorId: { in: corretorIds }, ...origemWhere },
        },
        select: {
          leadId: true,
          lead: {
            select: {
              corretorId: true,
              documentacoes: {
                select: { vgv: true },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });
      for (const event of events) {
        const isNew = markSale(event.leadId, event.lead.corretorId);
        if (isNew) {
          addVgv(event.lead.corretorId, event.lead.documentacoes[0]?.vgv);
        }
      }

      const leadsNaVenda = await this.prisma.lead.findMany({
        where: {
          tenantId,
          stage: { in: vendaSlugs },
          perdidoAt: null,
          corretorId: { in: corretorIds },
          ...origemWhere,
          ...(opts?.incluirEstoqueAtual
            ? {}
            : {
                updatedAt: { gte: periodo.inicio, lt: periodo.fim },
              }),
        },
        select: {
          id: true,
          corretorId: true,
          documentacoes: {
            select: { vgv: true },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      });
      for (const lead of leadsNaVenda) {
        const isNew = markSale(lead.id, lead.corretorId);
        if (isNew) {
          addVgv(lead.corretorId, lead.documentacoes[0]?.vgv);
        }
      }
    }

    return { vendas, vgv };
  }

  private async buildRanking(
    tenantId: string,
    corretores: {
      id: string;
      name: string;
      equipe: { id: string; name: string } | null;
    }[],
    mesAtual: Periodo,
    mesAnterior: Periodo,
    origem?: string,
  ) {
    if (corretores.length === 0) return [];
    const ids = corretores.map((c) => c.id);
    const origemWhere = origem ? { origem } : {};

    const [leadsAtivos, visitasMes, vendasAtual, vendasAnterior] =
      await Promise.all([
        this.prisma.lead.groupBy({
          by: ['corretorId'],
          where: {
            tenantId,
            perdidoAt: null,
            corretorId: { in: ids },
            ...origemWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.agendamento.groupBy({
          by: ['autorId'],
          where: {
            tenantId,
            autorId: { in: ids },
            tipo: AgendamentoTipo.visita,
            status: AgendamentoStatus.concluido,
            startsAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
            ...(origem ? { lead: { origem } } : {}),
          },
          _count: { _all: true },
        }),
        this.aggregateVendasPorCorretor(tenantId, ids, mesAtual, {
          incluirEstoqueAtual: true,
          origem,
        }),
        this.aggregateVendasPorCorretor(tenantId, ids, mesAnterior, {
          origem,
        }),
      ]);

    const leadsMap = new Map(
      leadsAtivos.map((r) => [r.corretorId!, r._count._all]),
    );
    const visitasMap = new Map(
      visitasMes.map((r) => [r.autorId, r._count._all]),
    );

    return corretores
      .map((c) => ({
        corretorId: c.id,
        nome: c.name,
        equipe: c.equipe?.name ?? null,
        leads: leadsMap.get(c.id) ?? 0,
        visitas: visitasMap.get(c.id) ?? 0,
        vendas: metric(
          vendasAtual.vendas.get(c.id) ?? 0,
          vendasAnterior.vendas.get(c.id) ?? 0,
        ),
        vgv: metric(
          vendasAtual.vgv.get(c.id) ?? 0,
          vendasAnterior.vgv.get(c.id) ?? 0,
        ),
      }))
      .sort(
        (a, b) =>
          b.vgv.valor - a.vgv.valor ||
          b.vendas.valor - a.vendas.valor ||
          b.leads - a.leads,
      );
  }

  private async buildDistribuicaoEquipes(
    tenantId: string,
    equipes: {
      id: string;
      name: string;
      membros: { id: string }[];
    }[],
    corretorIds: string[],
    origem?: string,
  ) {
    if (corretorIds.length === 0) return [];

    const leads = await this.prisma.lead.groupBy({
      by: ['corretorId', 'tipo'],
      where: {
        tenantId,
        perdidoAt: null,
        corretorId: { in: corretorIds },
        ...(origem ? { origem } : {}),
      },
      _count: { _all: true },
    });

    const byCorretor = new Map<string, { leads: number; clientes: number }>();
    for (const row of leads) {
      if (!row.corretorId) continue;
      const cur = byCorretor.get(row.corretorId) ?? { leads: 0, clientes: 0 };
      if (row.tipo === ContatoTipo.cliente) cur.clientes += row._count._all;
      else cur.leads += row._count._all;
      byCorretor.set(row.corretorId, cur);
    }

    const semEquipeIds = new Set(corretorIds);
    const result = equipes.map((eq) => {
      let leadsTotal = 0;
      let clientesTotal = 0;
      for (const m of eq.membros) {
        semEquipeIds.delete(m.id);
        const cur = byCorretor.get(m.id);
        if (!cur) continue;
        leadsTotal += cur.leads;
        clientesTotal += cur.clientes;
      }
      return {
        equipeId: eq.id,
        nome: eq.name,
        corretores: eq.membros.length,
        leads: leadsTotal,
        clientes: clientesTotal,
        total: leadsTotal + clientesTotal,
      };
    });

    if (semEquipeIds.size > 0) {
      let leadsTotal = 0;
      let clientesTotal = 0;
      for (const id of semEquipeIds) {
        const cur = byCorretor.get(id);
        if (!cur) continue;
        leadsTotal += cur.leads;
        clientesTotal += cur.clientes;
      }
      result.push({
        equipeId: 'sem-equipe',
        nome: 'Sem equipe',
        corretores: semEquipeIds.size,
        leads: leadsTotal,
        clientes: clientesTotal,
        total: leadsTotal + clientesTotal,
      });
    }

    return result.sort((a, b) => b.total - a.total);
  }

  private async buildMetasProgress(
    tenantId: string,
    metas: Array<{
      id: string;
      tipo: MetaTipo;
      valor: number;
      inicio: Date;
      fim: Date;
      corretorId: string | null;
      corretor: {
        id: string;
        name: string;
        equipeId: string | null;
        equipe: { id: string; name: string } | null;
      } | null;
    }>,
  ) {
    const items = await Promise.all(
      metas
        .filter((meta) => meta.corretorId && meta.corretor)
        .map(async (meta) => {
        const corretorId = meta.corretorId!;
        const corretor = meta.corretor!;
        let atual = 0;
        if (meta.tipo === MetaTipo.documentacoes) {
          atual = await this.prisma.documentacao.count({
            where: {
              tenantId,
              corretorId,
              createdAt: { gte: meta.inicio, lt: meta.fim },
            },
          });
        } else {
          const agora = new Date();
          const agg = await this.aggregateVendasPorCorretor(
            tenantId,
            [corretorId],
            { inicio: meta.inicio, fim: meta.fim },
            {
              incluirEstoqueAtual:
                agora >= meta.inicio && agora < meta.fim,
            },
          );
          atual =
            meta.tipo === MetaTipo.vendas
              ? (agg.vendas.get(corretorId) ?? 0)
              : (agg.vgv.get(corretorId) ?? 0);
        }
        return {
          id: meta.id,
          tipo: meta.tipo,
          valor: meta.valor,
          atual,
          percentual: Math.min(100, Math.round((atual / meta.valor) * 100)),
          corretorId,
          corretorNome: corretor.name,
          equipeId: corretor.equipeId,
          equipeNome: corretor.equipe?.name ?? null,
        };
      }),
    );

    const porEquipe = new Map<
      string,
      { equipeId: string; nome: string; meta: number; atual: number }
    >();
    let metaImob = 0;
    let atualImob = 0;
    for (const item of items) {
      metaImob += item.valor;
      atualImob += item.atual;
      const key = item.equipeId ?? 'sem-equipe';
      const nome = item.equipeNome ?? 'Sem equipe';
      const cur = porEquipe.get(key) ?? {
        equipeId: key,
        nome,
        meta: 0,
        atual: 0,
      };
      cur.meta += item.valor;
      cur.atual += item.atual;
      porEquipe.set(key, cur);
    }

    return {
      corretores: items,
      equipes: [...porEquipe.values()].map((e) => ({
        ...e,
        percentual:
          e.meta === 0 ? 0 : Math.min(100, Math.round((e.atual / e.meta) * 100)),
      })),
      imobiliaria: {
        meta: metaImob,
        atual: atualImob,
        percentual:
          metaImob === 0
            ? 0
            : Math.min(100, Math.round((atualImob / metaImob) * 100)),
      },
    };
  }

  /**
   * Ranking mensal completo: corretores (escopo da equipe) + gerentes (só admin).
   */
  async rankingCompleto(
    requester: AuthenticatedUser,
    filtros: { mes?: number; ano?: number; origem?: string } = {},
  ) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Ranking disponível para admin e gerente.',
      );
    }

    const tenantId = requireTenantId(requester);
    const { mesAtual, mesAnterior, agora } = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
    });
    const origem = filtros.origem?.trim() || undefined;
    const origemWhere = origem ? { origem } : {};
    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const taxaConversao = (vendas: number, entradas: number) =>
      entradas === 0 ? 0 : Number(((vendas / entradas) * 100).toFixed(1));

    const [corretores, equipes, metasAtivas] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: Role.corretor,
          status: UserStatus.ativo,
          ...(corretorIds ? { id: { in: corretorIds } } : {}),
        },
        select: {
          id: true,
          name: true,
          equipeId: true,
          equipe: {
            select: {
              id: true,
              name: true,
              gerenteId: true,
              gerente: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.equipe.findMany({
        where: {
          tenantId,
          status: UserStatus.ativo,
          ...(requester.role === Role.gerente
            ? { gerenteId: requester.id }
            : corretorIds
              ? { membros: { some: { id: { in: corretorIds } } } }
              : {}),
        },
        select: {
          id: true,
          name: true,
          gerenteId: true,
          gerente: { select: { id: true, name: true } },
          membros: {
            where: { role: Role.corretor, status: UserStatus.ativo },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.meta.findMany({
        where: {
          tenantId,
          escopo: 'corretor',
          inicio: { lte: agora },
          fim: { gt: agora },
          periodo: MetaPeriodo.mensal,
          ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
        },
        include: {
          corretor: {
            select: {
              id: true,
              name: true,
              equipeId: true,
              equipe: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const ids = corretores.map((c) => c.id);
    const emptyGroup = Promise.resolve(
      [] as Array<{
        corretorId?: string | null;
        autorId?: string;
        _count: { _all: number };
        _sum?: { vgv: number | null };
      }>,
    );

    const [
      leadsAtivos,
      entradasMes,
      entradasMesAnt,
      visitasMes,
      docsMes,
      vendasAtualAgg,
      vendasAnteriorAgg,
      perdidosMes,
      metas,
    ] = await Promise.all([
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              perdidoAt: null,
              corretorId: { in: ids },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              createdAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              createdAt: { gte: mesAnterior.inicio, lt: mesAnterior.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.agendamento.groupBy({
            by: ['autorId'],
            where: {
              tenantId,
              autorId: { in: ids },
              tipo: AgendamentoTipo.visita,
              status: AgendamentoStatus.concluido,
              startsAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...(origem ? { lead: { origem } } : {}),
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.documentacao.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              createdAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...(origem ? { lead: { origem } } : {}),
            },
            _count: { _all: true },
          }),
      this.aggregateVendasPorCorretor(tenantId, ids, mesAtual, {
        incluirEstoqueAtual: true,
        origem,
      }),
      this.aggregateVendasPorCorretor(tenantId, ids, mesAnterior, { origem }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              perdidoAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      this.buildMetasProgress(tenantId, metasAtivas),
    ]);

    const toMap = (
      rows: Array<{ corretorId?: string | null; _count: { _all: number } }>,
    ) =>
      new Map(
        rows
          .filter((r) => r.corretorId)
          .map((r) => [r.corretorId!, r._count._all]),
      );

    const leadsMap = toMap(leadsAtivos);
    const entradasMap = toMap(entradasMes);
    const entradasAntMap = toMap(entradasMesAnt);
    const visitasMap = new Map(
      visitasMes.map((r) => [r.autorId!, r._count._all]),
    );
    const docsMap = toMap(docsMes);
    const vendasMap = vendasAtualAgg.vendas;
    const vendasAntMap = vendasAnteriorAgg.vendas;
    const vgvMap = vendasAtualAgg.vgv;
    const vgvAntMap = vendasAnteriorAgg.vgv;
    const perdidosMap = toMap(perdidosMes);

    const metaByCorretor = new Map(
      metas.corretores.map((m) => [
        m.corretorId,
        {
          tipo: m.tipo,
          valor: m.valor,
          atual: m.atual,
          percentual: m.percentual,
        },
      ]),
    );

    const rankingCorretores = corretores
      .map((c) => {
        const entradas = entradasMap.get(c.id) ?? 0;
        const vendas = vendasMap.get(c.id) ?? 0;
        const vendasAnt = vendasAntMap.get(c.id) ?? 0;
        const entradasAnt = entradasAntMap.get(c.id) ?? 0;
        const taxa = taxaConversao(vendas, entradas);
        const taxaAnt = taxaConversao(vendasAnt, entradasAnt);
        return {
          corretorId: c.id,
          nome: c.name,
          equipeId: c.equipe?.id ?? null,
          equipe: c.equipe?.name ?? null,
          gerenteId: c.equipe?.gerente?.id ?? null,
          gerente: c.equipe?.gerente?.name ?? null,
          leads: leadsMap.get(c.id) ?? 0,
          entradas: metric(entradas, entradasAnt),
          visitas: visitasMap.get(c.id) ?? 0,
          documentacoes: docsMap.get(c.id) ?? 0,
          vendas: metric(vendas, vendasAnt),
          vgv: metric(vgvMap.get(c.id) ?? 0, vgvAntMap.get(c.id) ?? 0),
          taxaConversao: metric(taxa, taxaAnt),
          perdidos: perdidosMap.get(c.id) ?? 0,
          meta: metaByCorretor.get(c.id) ?? null,
        };
      })
      .sort(
        (a, b) =>
          b.vgv.valor - a.vgv.valor ||
          b.vendas.valor - a.vendas.valor ||
          b.entradas.valor - a.entradas.valor ||
          b.leads - a.leads,
      )
      .map((row, index) => ({ posicao: index + 1, ...row }));

    const byCorretorMetrics = new Map(
      rankingCorretores.map((r) => [r.corretorId, r]),
    );

    // Ranking de gerentes é visão administrativa (comparação entre equipes).
    const rankingGerentes =
      requester.role === Role.gerente
        ? []
        : equipes
            .map((eq) => {
              let leads = 0;
              let entradas = 0;
              let entradasAnt = 0;
              let visitas = 0;
              let vendas = 0;
              let vendasAnt = 0;
              let vgv = 0;
              let vgvAnt = 0;
              let perdidos = 0;
              for (const m of eq.membros) {
                const row = byCorretorMetrics.get(m.id);
                if (!row) continue;
                leads += row.leads;
                entradas += row.entradas.valor;
                entradasAnt += row.entradas.valorMesAnterior;
                visitas += row.visitas;
                vendas += row.vendas.valor;
                vendasAnt += row.vendas.valorMesAnterior;
                vgv += row.vgv.valor;
                vgvAnt += row.vgv.valorMesAnterior;
                perdidos += row.perdidos;
              }
              const taxa = taxaConversao(vendas, entradas);
              const taxaAnt = taxaConversao(vendasAnt, entradasAnt);
              return {
                gerenteId: eq.gerente.id,
                nome: eq.gerente.name,
                equipeId: eq.id,
                equipe: eq.name,
                corretores: eq.membros.length,
                leads,
                entradas: metric(entradas, entradasAnt),
                visitas,
                vendas: metric(vendas, vendasAnt),
                vgv: metric(vgv, vgvAnt),
                taxaConversao: metric(taxa, taxaAnt),
                perdidos,
              };
            })
            .sort(
              (a, b) =>
                b.vgv.valor - a.vgv.valor ||
                b.vendas.valor - a.vendas.valor ||
                b.entradas.valor - a.entradas.valor,
            )
            .map((row, index) => ({ posicao: index + 1, ...row }));

    const totais = rankingCorretores.reduce(
      (acc, r) => {
        acc.entradas += r.entradas.valor;
        acc.vendas += r.vendas.valor;
        acc.vgv += r.vgv.valor;
        acc.visitas += r.visitas;
        acc.perdidos += r.perdidos;
        return acc;
      },
      { entradas: 0, vendas: 0, vgv: 0, visitas: 0, perdidos: 0 },
    );

    return {
      periodo: {
        mesAtual: {
          inicio: mesAtual.inicio.toISOString(),
          fim: mesAtual.fim.toISOString(),
        },
        mesAnterior: {
          inicio: mesAnterior.inicio.toISOString(),
          fim: mesAnterior.fim.toISOString(),
        },
      },
      totais: {
        ...totais,
        taxaConversao: taxaConversao(totais.vendas, totais.entradas),
        corretores: rankingCorretores.length,
        gerentes: rankingGerentes.length,
      },
      corretores: rankingCorretores,
      gerentes: rankingGerentes,
    };
  }
}
