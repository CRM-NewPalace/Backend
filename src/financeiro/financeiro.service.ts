import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceiroComissaoStatus,
  FinanceiroMovimentoTipo,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  Role,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateMovimentoDto } from './dto/create-movimento.dto';
import { CreateParceiroDto } from './dto/create-parceiro.dto';
import { CreateTituloDto } from './dto/create-titulo.dto';
import { UpdateMovimentoDto } from './dto/update-movimento.dto';
import { UpdateParceiroDto } from './dto/update-parceiro.dto';

const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function isoDateOnly(d: Date): string {
  const brasil = new Date(d.getTime() - BRASIL_UTC_OFFSET_MS);
  const y = brasil.getUTCFullYear();
  const m = String(brasil.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brasil.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDayStart(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + BRASIL_UTC_OFFSET_MS);
}

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Parceiros ───────────────────────────────────────────────

  listParceiros(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.financeiroParceiro
      .findMany({
        where: { tenantId },
        orderBy: { nome: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapParceiro(r)));
  }

  async createParceiro(dto: CreateParceiroDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.financeiroParceiro.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        documento: dto.documento.trim(),
        tipo: dto.tipo,
        email: dto.email?.trim() || null,
        telefone: dto.telefone?.trim() || null,
        cidade: dto.cidade?.trim() || null,
        saldoAberto: dto.saldoAberto ?? 0,
        ativo: dto.ativo ?? true,
      },
    });
    return this.mapParceiro(row);
  }

  async updateParceiro(
    id: string,
    dto: UpdateParceiroDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    await this.findParceiroOrFail(id, requester);
    const row = await this.prisma.financeiroParceiro.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.documento !== undefined
          ? { documento: dto.documento.trim() }
          : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.telefone !== undefined
          ? { telefone: dto.telefone?.trim() || null }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : {}),
        ...(dto.saldoAberto !== undefined
          ? { saldoAberto: dto.saldoAberto }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
    });
    return this.mapParceiro(row);
  }

  async removeParceiro(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    await this.findParceiroOrFail(id, requester);
    await this.prisma.financeiroParceiro.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Movimentos ──────────────────────────────────────────────

  listMovimentos(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.financeiroMovimento
      .findMany({
        where: { tenantId },
        orderBy: { data: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapMovimento(r)));
  }

  async createMovimento(dto: CreateMovimentoDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = requireTenantId(requester);
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const row = await this.prisma.financeiroMovimento.create({
      data: {
        tenantId,
        data: parseDayStart(dto.data),
        descricao: dto.descricao.trim(),
        parceiroId: dto.parceiroId || null,
        parceiroNome,
        categoria: dto.categoria.trim(),
        centro: dto.centro?.trim() || '',
        tipo: dto.tipo,
        valor: dto.valor,
        status: dto.status ?? FinanceiroTituloStatus.aberto,
        formaPagamento: dto.formaPagamento?.trim() || '',
      },
    });
    return this.mapMovimento(row);
  }

  async updateMovimento(
    id: string,
    dto: UpdateMovimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findMovimentoOrFail(id, requester);
    const tenantId = requireTenantId(requester);

    let parceiroId = existing.parceiroId;
    let parceiroNome = existing.parceiroNome;

    if (dto.parceiroId !== undefined || dto.parceiroNome !== undefined) {
      const nextId =
        dto.parceiroId === undefined ? existing.parceiroId : dto.parceiroId;
      parceiroId = nextId || null;
      parceiroNome = await this.resolveParceiroNome(
        tenantId,
        nextId || undefined,
        dto.parceiroNome ?? undefined,
      );
    }

    const row = await this.prisma.financeiroMovimento.update({
      where: { id },
      data: {
        ...(dto.data !== undefined ? { data: parseDayStart(dto.data) } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.parceiroId !== undefined || dto.parceiroNome !== undefined
          ? { parceiroId, parceiroNome }
          : {}),
        ...(dto.categoria !== undefined
          ? { categoria: dto.categoria.trim() }
          : {}),
        ...(dto.centro !== undefined
          ? { centro: dto.centro?.trim() || '' }
          : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.formaPagamento !== undefined
          ? { formaPagamento: dto.formaPagamento?.trim() || '' }
          : {}),
      },
    });
    return this.mapMovimento(row);
  }

  async removeMovimento(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    await this.findMovimentoOrFail(id, requester);
    await this.prisma.financeiroMovimento.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Títulos ─────────────────────────────────────────────────

  listTitulos(requester: AuthenticatedUser, tipo?: FinanceiroTituloTipo) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.financeiroTitulo
      .findMany({
        where: { tenantId, ...(tipo ? { tipo } : {}) },
        orderBy: { vencimento: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapTitulo(r)));
  }

  async createTitulo(dto: CreateTituloDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = requireTenantId(requester);
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const row = await this.prisma.financeiroTitulo.create({
      data: {
        tenantId,
        tipo: dto.tipo,
        descricao: dto.descricao.trim(),
        parceiroId: dto.parceiroId || null,
        parceiroNome,
        categoria: dto.categoria?.trim() || '',
        centro: dto.centro?.trim() || '',
        vencimento: parseDayStart(dto.vencimento),
        valor: dto.valor,
        status: dto.status ?? FinanceiroTituloStatus.aberto,
        parcela: dto.parcela?.trim() || '',
      },
    });
    return this.mapTitulo(row);
  }

  // ─── Comissões ───────────────────────────────────────────────

  listComissoes(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.financeiroComissao
      .findMany({
        where: { tenantId },
        orderBy: { dataVenda: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapComissao(r)));
  }

  async createComissao(dto: CreateComissaoDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.financeiroComissao.create({
      data: {
        tenantId,
        corretor: dto.corretor.trim(),
        equipe: dto.equipe?.trim() || '',
        empreendimento: dto.empreendimento?.trim() || '',
        cliente: dto.cliente?.trim() || '',
        dataVenda: parseDayStart(dto.dataVenda),
        vgv: dto.vgv,
        percentual: dto.percentual,
        valor: dto.valor,
        status: dto.status ?? FinanceiroComissaoStatus.pendente,
      },
    });
    return this.mapComissao(row);
  }

  // ─── Resumos ─────────────────────────────────────────────────

  async visaoGeral(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    const now = new Date();
    const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const y = brasil.getUTCFullYear();
    const m = brasil.getUTCMonth();
    const inicioMes = new Date(Date.UTC(y, m, 1) + BRASIL_UTC_OFFSET_MS);
    const inicioProx = new Date(Date.UTC(y, m + 1, 1) + BRASIL_UTC_OFFSET_MS);
    const inicioAnt = new Date(Date.UTC(y, m - 1, 1) + BRASIL_UTC_OFFSET_MS);

    const [movMes, movAnt, aReceber, aPagar, saldoParceiros] =
      await Promise.all([
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            data: { gte: inicioMes, lt: inicioProx },
            status: { not: FinanceiroTituloStatus.cancelado },
          },
        }),
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            data: { gte: inicioAnt, lt: inicioMes },
            status: { not: FinanceiroTituloStatus.cancelado },
          },
        }),
        this.prisma.financeiroTitulo.aggregate({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.receber,
            status: {
              in: [FinanceiroTituloStatus.aberto, FinanceiroTituloStatus.atrasado],
            },
          },
          _sum: { valor: true },
        }),
        this.prisma.financeiroTitulo.aggregate({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.pagar,
            status: {
              in: [FinanceiroTituloStatus.aberto, FinanceiroTituloStatus.atrasado],
            },
          },
          _sum: { valor: true },
        }),
        this.prisma.financeiroParceiro.aggregate({
          where: { tenantId, ativo: true },
          _sum: { saldoAberto: true },
        }),
      ]);

    const sumTipo = (
      rows: { tipo: FinanceiroMovimentoTipo; valor: number }[],
      tipo: FinanceiroMovimentoTipo,
    ) => rows.filter((r) => r.tipo === tipo).reduce((s, r) => s + r.valor, 0);

    const receitasMes = sumTipo(movMes, FinanceiroMovimentoTipo.entrada);
    const despesasMes = sumTipo(movMes, FinanceiroMovimentoTipo.saida);
    const receitasAnt = sumTipo(movAnt, FinanceiroMovimentoTipo.entrada);
    const despesasAnt = sumTipo(movAnt, FinanceiroMovimentoTipo.saida);
    const resultadoMes = receitasMes - despesasMes;
    const resultadoAnt = receitasAnt - despesasAnt;

    const evolucao = (atual: number, anterior: number): number | null => {
      if (anterior === 0) return atual === 0 ? 0 : null;
      return Number((((atual - anterior) / anterior) * 100).toFixed(1));
    };

    const mesesResumo = await this.buildMesesResumo(tenantId, 6);
    const centros = await this.buildCentros(tenantId);

    return {
      kpis: {
        saldoAtual: saldoParceiros._sum.saldoAberto ?? 0,
        receitasMes,
        despesasMes,
        aReceber: aReceber._sum.valor ?? 0,
        aPagar: aPagar._sum.valor ?? 0,
        resultadoMes,
        evolucaoReceitas: evolucao(receitasMes, receitasAnt),
        evolucaoDespesas: evolucao(despesasMes, despesasAnt),
        evolucaoResultado: evolucao(resultadoMes, resultadoAnt),
      },
      mesesResumo,
      centros,
    };
  }

  async fluxoCaixa(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    const rows = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        status: { not: FinanceiroTituloStatus.cancelado },
      },
      orderBy: { data: 'asc' },
    });

    const byDay = new Map<string, { entradas: number; saidas: number }>();
    for (const r of rows) {
      const dia = isoDateOnly(r.data);
      const cur = byDay.get(dia) ?? { entradas: 0, saidas: 0 };
      if (r.tipo === FinanceiroMovimentoTipo.entrada) cur.entradas += r.valor;
      else cur.saidas += r.valor;
      byDay.set(dia, cur);
    }

    let saldo = 0;
    return [...byDay.entries()].map(([dia, v]) => {
      saldo += v.entradas - v.saidas;
      return { dia, entradas: v.entradas, saidas: v.saidas, saldo };
    });
  }

  async centrosDespesa(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    return this.buildCentros(tenantId);
  }

  async demonstrativo(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = requireTenantId(requester);
    const mesesResumo = await this.buildMesesResumo(tenantId, 3);
    const meses = mesesResumo.map((m) => m.mes);

    const linha = (
      id: string,
      grupo: 'receita' | 'custo' | 'despesa' | 'resultado',
      label: string,
      valores: Record<string, number>,
      destaque?: boolean,
    ) => ({ id, grupo, label, valores, ...(destaque ? { destaque: true } : {}) });

    const receitas: Record<string, number> = {};
    const despesas: Record<string, number> = {};
    const resultado: Record<string, number> = {};
    for (const m of mesesResumo) {
      receitas[m.mes] = m.receitas;
      despesas[m.mes] = m.despesas;
      resultado[m.mes] = m.receitas - m.despesas;
    }

    return {
      meses,
      linhas: [
        linha('rec', 'receita', 'Receitas', receitas),
        linha('desp', 'despesa', 'Despesas', despesas),
        linha('res', 'resultado', 'Resultado', resultado, true),
      ],
      mesesResumo,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async buildMesesResumo(tenantId: string, qtd: number) {
    const now = new Date();
    const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const result: { mes: string; receitas: number; despesas: number }[] = [];

    for (let i = qtd - 1; i >= 0; i -= 1) {
      const ref = new Date(
        Date.UTC(brasil.getUTCFullYear(), brasil.getUTCMonth() - i, 1),
      );
      const y = ref.getUTCFullYear();
      const m = ref.getUTCMonth();
      const inicio = new Date(Date.UTC(y, m, 1) + BRASIL_UTC_OFFSET_MS);
      const fim = new Date(Date.UTC(y, m + 1, 1) + BRASIL_UTC_OFFSET_MS);
      const rows = await this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          data: { gte: inicio, lt: fim },
          status: { not: FinanceiroTituloStatus.cancelado },
        },
      });
      result.push({
        mes: MESES_CURTOS[m],
        receitas: rows
          .filter((r) => r.tipo === FinanceiroMovimentoTipo.entrada)
          .reduce((s, r) => s + r.valor, 0),
        despesas: rows
          .filter((r) => r.tipo === FinanceiroMovimentoTipo.saida)
          .reduce((s, r) => s + r.valor, 0),
      });
    }
    return result;
  }

  private async buildCentros(tenantId: string) {
    const rows = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        tipo: FinanceiroMovimentoTipo.saida,
        status: { not: FinanceiroTituloStatus.cancelado },
      },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.centro || 'Sem centro';
      map.set(key, (map.get(key) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([centro, realizado]) => ({
        centro,
        orcado: realizado,
        realizado,
        percentual: 100,
      }))
      .sort((a, b) => b.realizado - a.realizado);
  }

  private async findMovimentoOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.financeiroMovimento.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Movimento não encontrado.');
    return row;
  }

  private async findParceiroOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.financeiroParceiro.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Parceiro não encontrado.');
    return row;
  }

  private async resolveParceiroNome(
    tenantId: string,
    parceiroId?: string,
    fallback?: string,
  ) {
    if (parceiroId) {
      const p = await this.prisma.financeiroParceiro.findFirst({
        where: { id: parceiroId, tenantId },
        select: { nome: true },
      });
      if (!p) throw new NotFoundException('Parceiro não encontrado.');
      return p.nome;
    }
    return fallback?.trim() || '';
  }

  private mapParceiro(row: {
    id: string;
    nome: string;
    documento: string;
    tipo: string;
    email: string | null;
    telefone: string | null;
    cidade: string | null;
    saldoAberto: number;
    ativo: boolean;
  }) {
    return {
      id: row.id,
      nome: row.nome,
      documento: row.documento,
      tipo: row.tipo,
      email: row.email ?? '',
      telefone: row.telefone ?? '',
      cidade: row.cidade ?? '',
      saldoAberto: row.saldoAberto,
      ativo: row.ativo,
    };
  }

  private mapMovimento(row: {
    id: string;
    data: Date;
    descricao: string;
    parceiroId: string | null;
    parceiroNome: string;
    categoria: string;
    centro: string;
    tipo: string;
    valor: number;
    status: string;
    formaPagamento: string;
  }) {
    return {
      id: row.id,
      data: isoDateOnly(row.data),
      descricao: row.descricao,
      parceiroId: row.parceiroId,
      parceiro: row.parceiroNome,
      categoria: row.categoria,
      centro: row.centro,
      tipo: row.tipo,
      valor: row.valor,
      status: row.status,
      formaPagamento: row.formaPagamento,
    };
  }

  private mapTitulo(row: {
    id: string;
    descricao: string;
    parceiroNome: string;
    categoria: string;
    centro: string;
    vencimento: Date;
    valor: number;
    status: string;
    parcela: string;
  }) {
    return {
      id: row.id,
      descricao: row.descricao,
      parceiro: row.parceiroNome,
      categoria: row.categoria,
      centro: row.centro,
      vencimento: isoDateOnly(row.vencimento),
      valor: row.valor,
      status: row.status,
      parcela: row.parcela,
    };
  }

  private mapComissao(row: {
    id: string;
    corretor: string;
    equipe: string;
    empreendimento: string;
    cliente: string;
    dataVenda: Date;
    vgv: number;
    percentual: number;
    valor: number;
    status: string;
  }) {
    return {
      id: row.id,
      corretor: row.corretor,
      equipe: row.equipe,
      empreendimento: row.empreendimento,
      cliente: row.cliente,
      dataVenda: isoDateOnly(row.dataVenda),
      vgv: row.vgv,
      percentual: row.percentual,
      valor: row.valor,
      status: row.status,
    };
  }

  private assertAccess(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Módulo financeiro disponível para admin e gerente.',
      );
    }
  }

  private assertWrite(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Sem permissão para alterar dados financeiros.',
      );
    }
  }
}
