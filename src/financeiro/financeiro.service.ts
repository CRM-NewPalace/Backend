import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceiroComissaoStatus,
  FinanceiroDespesaNatureza,
  FinanceiroMovimentoTipo,
  FinanceiroParceiroTipo,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  isStatusVendido,
  status2VendidoWhere,
} from '../common/utils/documentacao-status';
import { resolveFinanceiroTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { BaixarTituloDto } from './dto/baixar-titulo.dto';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateDespesaDto } from './dto/create-despesa.dto';
import { CreateDespesaTipoDto } from './dto/create-despesa-tipo.dto';
import { CreateMovimentoDto } from './dto/create-movimento.dto';
import { CreateParceiroDto } from './dto/create-parceiro.dto';
import { CreateTituloDto } from './dto/create-titulo.dto';
import { CreateTitulosParceladoDto } from './dto/create-titulos-parcelado.dto';
import {
  FluxoGranularidade,
  QueryFluxoCaixaDto,
} from './dto/query-fluxo-caixa.dto';
import { UpdateDespesaDto } from './dto/update-despesa.dto';
import { UpdateComissaoDto } from './dto/update-comissao.dto';
import { UpdateDespesaTipoDto } from './dto/update-despesa-tipo.dto';
import { UpdateMovimentoDto } from './dto/update-movimento.dto';
import { UpdateParceiroDto } from './dto/update-parceiro.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';
import { RenovarDespesasDto } from './dto/renovar-despesas.dto';
import { randomUUID } from 'crypto';

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

function competenciaFromIsoDate(iso: string): string {
  return iso.slice(0, 7);
}

function competenciaAtualBrasil(): string {
  const brasil = new Date(Date.now() - BRASIL_UTC_OFFSET_MS);
  const y = brasil.getUTCFullYear();
  const m = String(brasil.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function dataFromCompetencia(competencia: string, day = 1): Date {
  const [ys, ms] = competencia.split('-');
  const y = Number(ys);
  const m = Number(ms);
  return new Date(Date.UTC(y, m - 1, day) + BRASIL_UTC_OFFSET_MS);
}

const DEFAULT_DESPESA_CATEGORIAS = ['Estrutural', 'Marketing', 'Operacional'];

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

function parseDayEnd(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) + BRASIL_UTC_OFFSET_MS);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function todayIsoBrasil(): string {
  return isoDateOnly(new Date());
}

function startOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonthIso(iso: string): string {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/** Segunda-feira da semana ISO (semana começa na segunda). */
function startOfWeekIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isoWeekKey(iso: string): {
  chave: string;
  inicio: string;
  fim: string;
} {
  const inicio = startOfWeekIso(iso);
  const fim = addDaysIso(inicio, 6);
  const [y, m, d] = inicio.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // ISO week number
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getUTCDay() + 6) % 7)) /
        7,
    );
  const year = thursday.getUTCFullYear();
  return {
    chave: `${year}-W${String(week).padStart(2, '0')}`,
    inicio,
    fim,
  };
}

function quarterKey(iso: string): {
  chave: string;
  inicio: string;
  fim: string;
} {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const inicio = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  const fim = endOfMonthIso(`${y}-${String(endMonth).padStart(2, '0')}-01`);
  return { chave: `${y}-Q${q}`, inicio, fim };
}

type FluxoEvento = {
  data: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  natureza: 'realizado' | 'previsto';
  origem: 'titulo' | 'movimento';
  id: string;
  descricao: string;
  parceiro: string;
  categoria: string;
  centro: string;
  status: string;
};

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Parceiros ───────────────────────────────────────────────

  listParceiros(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const fornecedorOnly = requester.role === Role.super_admin;
    return Promise.all([
      this.prisma.financeiroParceiro.findMany({
        where: {
          tenantId,
          ...(fornecedorOnly
            ? {
                tipo: {
                  in: [
                    FinanceiroParceiroTipo.fornecedor,
                    FinanceiroParceiroTipo.ambos,
                  ],
                },
              }
            : {}),
        },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          parceiroId: { not: null },
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
        },
        select: { parceiroId: true, tipo: true, valor: true },
      }),
    ]).then(([rows, movimentos]) => {
      const saldoByParceiro = this.sumSaldoPorParceiro(movimentos);
      return rows.map((r) =>
        this.mapParceiro({
          ...r,
          saldoAberto: saldoByParceiro.get(r.id) ?? 0,
        }),
      );
    });
  }

  async createParceiro(dto: CreateParceiroDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tipo =
      requester.role === Role.super_admin
        ? FinanceiroParceiroTipo.fornecedor
        : dto.tipo;
    const row = await this.prisma.financeiroParceiro.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        documento: dto.documento.trim(),
        tipo,
        email: dto.email?.trim() || null,
        telefone: dto.telefone?.trim() || null,
        cidade: dto.cidade?.trim() || null,
        imobiliaria: dto.imobiliaria?.trim() || '',
        saldoAberto: 0,
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
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.findParceiroOrFail(id, requester);
    const tipoOverride =
      requester.role === Role.super_admin
        ? FinanceiroParceiroTipo.fornecedor
        : dto.tipo;
    const row = await this.prisma.financeiroParceiro.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.documento !== undefined
          ? { documento: dto.documento.trim() }
          : {}),
        ...(tipoOverride !== undefined ? { tipo: tipoOverride } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.telefone !== undefined
          ? { telefone: dto.telefone?.trim() || null }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : {}),
        ...(dto.imobiliaria !== undefined
          ? { imobiliaria: dto.imobiliaria?.trim() || '' }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
    });
    await this.recalcSaldoParceiro(tenantId, id);
    const saldo =
      (
        await this.prisma.financeiroParceiro.findFirst({
          where: { id, tenantId },
          select: { saldoAberto: true },
        })
      )?.saldoAberto ?? 0;
    return this.mapParceiro({ ...row, saldoAberto: saldo });
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
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroMovimento
      .findMany({
        where: { tenantId },
        orderBy: { data: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapMovimento(r)));
  }

  async createMovimento(dto: CreateMovimentoDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
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
    await this.recalcSaldoParceiro(tenantId, row.parceiroId);
    return this.mapMovimento(row);
  }

  async updateMovimento(
    id: string,
    dto: UpdateMovimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findMovimentoOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);

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

    const parceiroIds = new Set<string>();
    if (existing.parceiroId) parceiroIds.add(existing.parceiroId);
    if (row.parceiroId) parceiroIds.add(row.parceiroId);
    for (const pid of parceiroIds) {
      await this.recalcSaldoParceiro(tenantId, pid);
    }

    return this.mapMovimento(row);
  }

  async removeMovimento(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const existing = await this.findMovimentoOrFail(id, requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.prisma.financeiroMovimento.delete({ where: { id } });
    await this.recalcSaldoParceiro(tenantId, existing.parceiroId);
    return { ok: true };
  }

  // ─── Títulos ─────────────────────────────────────────────────

  listTitulos(
    requester: AuthenticatedUser,
    tipo?: FinanceiroTituloTipo,
    grupoParcelasId?: string,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroTitulo
      .findMany({
        where: {
          tenantId,
          ...(tipo ? { tipo } : {}),
          ...(grupoParcelasId ? { grupoParcelasId } : {}),
        },
        include: { movimento: { select: { formaPagamento: true } } },
        orderBy: { vencimento: 'asc' },
      })
      .then((rows) => rows.map((r) => this.mapTitulo(r)));
  }

  async createTitulo(dto: CreateTituloDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
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

  async createTitulosParcelado(
    dto: CreateTitulosParceladoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    if (!dto.parcelas?.length || dto.parcelas.length < 2) {
      throw new BadRequestException('Informe ao menos 2 parcelas.');
    }
    for (const p of dto.parcelas) {
      if (!Number.isFinite(p.valor) || p.valor <= 0) {
        throw new BadRequestException(
          'Todas as parcelas precisam de valor maior que zero.',
        );
      }
    }
    const parceiroNome = await this.resolveParceiroNome(
      tenantId,
      dto.parceiroId,
      dto.parceiroNome,
    );
    const grupoParcelasId = randomUUID();
    const n = dto.parcelas.length;
    const descricao = dto.descricao.trim();
    const categoria = dto.categoria?.trim() || '';
    const centro = dto.centro?.trim() || '';

    const rows = await this.prisma.$transaction(
      dto.parcelas.map((p, i) =>
        this.prisma.financeiroTitulo.create({
          data: {
            tenantId,
            tipo: dto.tipo,
            descricao,
            parceiroId: dto.parceiroId || null,
            parceiroNome,
            categoria,
            centro,
            vencimento: parseDayStart(p.vencimento),
            valor: p.valor,
            status: FinanceiroTituloStatus.aberto,
            parcela: `${i + 1}/${n}`,
            grupoParcelasId,
          },
        }),
      ),
    );

    return rows.map((r) => this.mapTitulo(r));
  }

  async updateTitulo(
    id: string,
    dto: UpdateTituloDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    if (existing.status === FinanceiroTituloStatus.pago) {
      throw new BadRequestException(
        'Título já baixado. Não é possível editar.',
      );
    }
    const tenantId = resolveFinanceiroTenantId(requester);

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

    const row = await this.prisma.financeiroTitulo.update({
      where: { id },
      data: {
        ...(dto.tipo !== undefined ? { tipo: dto.tipo } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.parceiroId !== undefined || dto.parceiroNome !== undefined
          ? { parceiroId, parceiroNome }
          : {}),
        ...(dto.categoria !== undefined
          ? { categoria: dto.categoria?.trim() || '' }
          : {}),
        ...(dto.centro !== undefined
          ? { centro: dto.centro?.trim() || '' }
          : {}),
        ...(dto.vencimento !== undefined
          ? { vencimento: parseDayStart(dto.vencimento) }
          : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.parcela !== undefined
          ? { parcela: dto.parcela?.trim() || '' }
          : {}),
      },
    });
    return this.mapTitulo(row);
  }

  async removeTitulo(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    if (existing.status === FinanceiroTituloStatus.pago) {
      throw new BadRequestException(
        'Título baixado não pode ser excluído. Cancele o movimento vinculado se necessário.',
      );
    }
    await this.prisma.financeiroTitulo.delete({ where: { id } });
    return { ok: true };
  }

  async baixarTitulo(
    id: string,
    dto: BaixarTituloDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findTituloOrFail(id, requester);
    if (existing.status === FinanceiroTituloStatus.pago) {
      throw new BadRequestException('Título já está baixado.');
    }
    if (existing.status === FinanceiroTituloStatus.cancelado) {
      throw new BadRequestException('Título cancelado não pode ser baixado.');
    }
    const tenantId = resolveFinanceiroTenantId(requester);
    const dataPagamento = parseDayStart(dto.dataPagamento);
    const tipoMov =
      existing.tipo === FinanceiroTituloTipo.receber
        ? FinanceiroMovimentoTipo.entrada
        : FinanceiroMovimentoTipo.saida;

    const [titulo] = await this.prisma.$transaction([
      this.prisma.financeiroTitulo.update({
        where: { id },
        data: {
          status: FinanceiroTituloStatus.pago,
          dataPagamento,
        },
      }),
      this.prisma.financeiroMovimento.create({
        data: {
          tenantId,
          data: dataPagamento,
          descricao: existing.descricao,
          parceiroId: existing.parceiroId,
          parceiroNome: existing.parceiroNome,
          categoria: existing.categoria || 'Título',
          centro: existing.centro,
          tipo: tipoMov,
          valor: existing.valor,
          status: FinanceiroTituloStatus.pago,
          formaPagamento: dto.formaPagamento?.trim() || '',
          tituloId: existing.id,
        },
      }),
    ]);

    await this.recalcSaldoParceiro(tenantId, existing.parceiroId);
    return this.mapTitulo(titulo);
  }

  // ─── Comissões ───────────────────────────────────────────────

  async listVendasElegiveis(requester: AuthenticatedUser) {
    this.assertComissaoAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const corretorSelect = {
      id: true,
      name: true,
      equipeId: true,
      equipe: {
        select: {
          name: true,
          gerenteId: true,
          gerente: { select: { name: true } },
        },
      },
    } as const;
    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        vgv: { gt: 0 },
        AND: [status2VendidoWhere()],
      },
      include: {
        corretor: { select: corretorSelect },
        lead: { select: { corretor: { select: corretorSelect } } },
        gerente: { select: { id: true, name: true } },
        empreendimento: { select: { nome: true } },
      },
      orderBy: [{ dataVenda: 'desc' }, { createdAt: 'desc' }],
    });
    return rows
      .filter((row) => isStatusVendido(row.status2))
      .map((row) => {
        const corretor = row.corretor ?? row.lead.corretor;
        return {
          documentacaoId: row.id,
          cliente: row.nome,
          empreendimento: row.empreendimento?.nome ?? '',
          dataVenda: isoDateOnly(row.dataVenda ?? row.createdAt),
          vgv: row.vgv!,
          corretorId: corretor?.id ?? null,
          corretor: corretor?.name ?? '',
          equipeId: corretor?.equipeId ?? null,
          equipe: corretor?.equipe?.name ?? '',
          gerenteId: row.gerente?.id ?? corretor?.equipe?.gerenteId ?? null,
          gerente: row.gerente?.name ?? corretor?.equipe?.gerente.name ?? '',
        };
      })
      // createComissao exige corretor — não oferece venda sem dono.
      .filter((row) => Boolean(row.corretorId));
  }

  async listComissoes(requester: AuthenticatedUser) {
    this.assertComissaoAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const where: Prisma.FinanceiroComissaoWhereInput = { tenantId };
    if (requester.role === Role.corretor) where.corretorId = requester.id;
    if (requester.role === Role.gerente) {
      // Inclui comissão sem equipe (equipeId null) se o gerente estiver no snapshot.
      where.OR = [
        { equipeRegistro: { gerenteId: requester.id } },
        { gerenteId: requester.id },
      ];
    }
    const rows = await this.prisma.financeiroComissao.findMany({
      where,
      orderBy: { dataVenda: 'desc' },
    });
    return rows.map((row) => this.mapComissao(row, requester));
  }

  async createComissao(dto: CreateComissaoDto, requester: AuthenticatedUser) {
    this.assertComissaoWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const corretorSelect = {
      id: true,
      name: true,
      equipeId: true,
      equipe: {
        select: {
          name: true,
          gerenteId: true,
          gerente: { select: { name: true } },
        },
      },
    } as const;
    const doc = await this.prisma.documentacao.findFirst({
      where: { id: dto.documentacaoId, tenantId },
      include: {
        corretor: { select: corretorSelect },
        lead: { select: { corretor: { select: corretorSelect } } },
        gerente: { select: { id: true, name: true } },
        empreendimento: { select: { nome: true } },
      },
    });
    if (!doc || !isStatusVendido(doc.status2) || !doc.vgv || doc.vgv <= 0) {
      throw new BadRequestException('Documentação não é uma venda elegível.');
    }
    const corretor = doc.corretor ?? doc.lead.corretor;
    if (!corretor) {
      throw new BadRequestException('A documentação precisa ter um corretor.');
    }
    const gerenteId = doc.gerente?.id ?? corretor.equipe?.gerenteId ?? null;
    const gerenteNome =
      doc.gerente?.name ?? corretor.equipe?.gerente.name ?? '';
    const values = this.calculateComissao(doc.vgv, dto);
    const row = await this.prisma.financeiroComissao.create({
      data: {
        tenantId,
        documentacaoId: doc.id,
        corretorId: corretor.id,
        gerenteId,
        equipeId: corretor.equipeId,
        corretor: corretor.name,
        gerente: gerenteNome,
        equipe: corretor.equipe?.name ?? '',
        empreendimento: doc.empreendimento?.nome ?? '',
        cliente: doc.nome,
        dataVenda: doc.dataVenda ?? doc.createdAt,
        status: FinanceiroComissaoStatus.pendente,
        ...values,
      },
    });
    return this.mapComissao(row, requester);
  }

  async updateComissao(
    id: string,
    dto: UpdateComissaoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertComissaoWrite(requester);
    const existing = await this.findComissaoOrFail(id, requester);
    const percentages = {
      percentualImobiliaria:
        dto.percentualImobiliaria ?? Number(existing.percentualImobiliaria),
      percentualTributos:
        dto.percentualTributos ?? Number(existing.percentualTributos),
      percentualCorretor:
        dto.percentualCorretor ?? Number(existing.percentualCorretor),
      percentualGerente:
        dto.percentualGerente ?? Number(existing.percentualGerente),
      percentualCaixa: dto.percentualCaixa ?? Number(existing.percentualCaixa),
      percentualSocios:
        dto.percentualSocios ?? Number(existing.percentualSocios),
    };
    const values = this.calculateComissao(Number(existing.vgv), percentages);
    const row = await this.prisma.financeiroComissao.update({
      where: { id },
      data: { ...values, ...(dto.status ? { status: dto.status } : {}) },
    });
    return this.mapComissao(row, requester);
  }

  async removeComissao(id: string, requester: AuthenticatedUser) {
    this.assertComissaoWrite(requester);
    await this.findComissaoOrFail(id, requester);
    await this.prisma.financeiroComissao.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Resumos ─────────────────────────────────────────────────

  async visaoGeral(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const now = new Date();
    const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const y = brasil.getUTCFullYear();
    const m = brasil.getUTCMonth();
    const inicioMes = new Date(Date.UTC(y, m, 1) + BRASIL_UTC_OFFSET_MS);
    const inicioProx = new Date(Date.UTC(y, m + 1, 1) + BRASIL_UTC_OFFSET_MS);
    const inicioAnt = new Date(Date.UTC(y, m - 1, 1) + BRASIL_UTC_OFFSET_MS);

    const [movMes, movAnt, aReceber, aPagar, movAbertosParceiro] =
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
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
          },
          _sum: { valor: true },
        }),
        this.prisma.financeiroTitulo.aggregate({
          where: {
            tenantId,
            tipo: FinanceiroTituloTipo.pagar,
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
          },
          _sum: { valor: true },
        }),
        this.prisma.financeiroMovimento.findMany({
          where: {
            tenantId,
            parceiroId: { not: null },
            status: {
              in: [
                FinanceiroTituloStatus.aberto,
                FinanceiroTituloStatus.atrasado,
              ],
            },
          },
          select: { tipo: true, valor: true },
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
    const saldoAtual = movAbertosParceiro.reduce((acc, m) => {
      return m.tipo === FinanceiroMovimentoTipo.entrada
        ? acc + m.valor
        : acc - m.valor;
    }, 0);
    const centros = await this.buildCentros(tenantId);

    return {
      kpis: {
        saldoAtual,
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

  async fluxoCaixa(requester: AuthenticatedUser, query: QueryFluxoCaixaDto) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const granularidade: FluxoGranularidade = query.granularidade ?? 'dia';
    const today = todayIsoBrasil();
    const from = query.from?.slice(0, 10) ?? startOfMonthIso(today);
    const to = query.to?.slice(0, 10) ?? endOfMonthIso(today);
    if (from > to) {
      throw new BadRequestException('Data inicial maior que a final.');
    }

    const eventos = await this.collectFluxoEventos(tenantId, from, to);
    const buckets = this.buildFluxoBuckets(from, to, granularidade);

    type Acc = {
      entradasRealizadas: number;
      saidasRealizadas: number;
      entradasPrevistas: number;
      saidasPrevistas: number;
    };
    const byKey = new Map<string, Acc>();
    for (const b of buckets) {
      byKey.set(b.chave, {
        entradasRealizadas: 0,
        saidasRealizadas: 0,
        entradasPrevistas: 0,
        saidasPrevistas: 0,
      });
    }

    for (const ev of eventos) {
      const meta = this.bucketMetaForDate(ev.data, granularidade);
      const acc = byKey.get(meta.chave);
      if (!acc) continue;
      if (ev.natureza === 'realizado') {
        if (ev.tipo === 'entrada') acc.entradasRealizadas += ev.valor;
        else acc.saidasRealizadas += ev.valor;
      } else {
        if (ev.tipo === 'entrada') acc.entradasPrevistas += ev.valor;
        else acc.saidasPrevistas += ev.valor;
      }
    }

    let saldoRealizado = 0;
    let saldoProjetado = 0;
    return buckets.map((b) => {
      const v = byKey.get(b.chave)!;
      const liquidoReal = v.entradasRealizadas - v.saidasRealizadas;
      const liquidoPrev = v.entradasPrevistas - v.saidasPrevistas;
      saldoRealizado += liquidoReal;
      saldoProjetado += liquidoReal + liquidoPrev;
      return {
        chave: b.chave,
        label: b.label,
        inicio: b.inicio,
        fim: b.fim,
        entradasRealizadas: v.entradasRealizadas,
        saidasRealizadas: v.saidasRealizadas,
        entradasPrevistas: v.entradasPrevistas,
        saidasPrevistas: v.saidasPrevistas,
        saldoRealizado,
        saldoProjetado,
        // Compat com UI antiga / gráficos simples
        dia: b.chave,
        entradas: v.entradasRealizadas + v.entradasPrevistas,
        saidas: v.saidasRealizadas + v.saidasPrevistas,
        saldo: saldoProjetado,
      };
    });
  }

  async fluxoCaixaItens(
    requester: AuthenticatedUser,
    from?: string,
    to?: string,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const today = todayIsoBrasil();
    const start = from?.slice(0, 10) ?? today;
    const end = to?.slice(0, 10) ?? start;
    const eventos = await this.collectFluxoEventos(tenantId, start, end);
    return eventos.sort((a, b) => a.data.localeCompare(b.data));
  }

  async centrosDespesa(requester: AuthenticatedUser) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.buildCentros(tenantId);
  }

  // ─── Tipos de despesa (fixa / variável) ─────────────────────

  async listDespesaTipos(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    await this.ensureDefaultDespesaCategorias(tenantId);
    const competencia = competenciaAtualBrasil();
    const { gte, lt } = this.competenciaDateBounds(competencia);
    const rows = await this.prisma.financeiroDespesaTipo.findMany({
      where: {
        tenantId,
        ...(natureza ? { natureza } : {}),
      },
      include: {
        _count: { select: { despesas: true } },
        despesas: {
          where: {
            ativo: true,
            OR: [
              { competencia },
              { competencia: '', data: { gte, lt } },
            ],
          },
          select: { valor: true },
        },
      },
      orderBy: [{ natureza: 'asc' }, { nome: 'asc' }],
    });
    return rows.map((r) => this.mapDespesaTipo(r));
  }

  async createDespesaTipo(
    dto: CreateDespesaTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const nome = dto.nome.trim();
    try {
      const row = await this.prisma.financeiroDespesaTipo.create({
        data: {
          tenantId,
          nome,
          natureza: dto.natureza,
          orcadoMensal: dto.orcadoMensal ?? 0,
          ativo: dto.ativo ?? true,
        },
        include: {
          _count: { select: { despesas: true } },
          despesas: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapDespesaTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe um tipo com este nome nesta natureza.',
        );
      }
      throw err;
    }
  }

  async updateDespesaTipo(
    id: string,
    dto: UpdateDespesaTipoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    await this.findDespesaTipoOrFail(id, requester);
    try {
      const row = await this.prisma.financeiroDespesaTipo.update({
        where: { id },
        data: {
          ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
          ...(dto.natureza !== undefined ? { natureza: dto.natureza } : {}),
          ...(dto.orcadoMensal !== undefined
            ? { orcadoMensal: dto.orcadoMensal }
            : {}),
          ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
        },
        include: {
          _count: { select: { despesas: true } },
          despesas: { where: { ativo: true }, select: { valor: true } },
        },
      });
      return this.mapDespesaTipo(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe um tipo com este nome nesta natureza.',
        );
      }
      throw err;
    }
  }

  async removeDespesaTipo(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    await this.findDespesaTipoOrFail(id, requester);
    await this.prisma.financeiroDespesaTipo.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Despesas ────────────────────────────────────────────────

  listDespesas(
    requester: AuthenticatedUser,
    natureza?: FinanceiroDespesaNatureza,
  ) {
    this.assertAccess(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    return this.prisma.financeiroDespesa
      .findMany({
        where: {
          tenantId,
          ...(natureza ? { tipo: { natureza } } : {}),
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
        orderBy: { data: 'desc' },
      })
      .then((rows) => rows.map((r) => this.mapDespesa(r)));
  }

  async createDespesa(dto: CreateDespesaDto, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const tipo = await this.findDespesaTipoOrFail(dto.tipoId, requester);
    if (!tipo.ativo) {
      throw new BadRequestException('Tipo de despesa inativo.');
    }
    const competencia =
      dto.competencia?.trim() || competenciaFromIsoDate(dto.data);
    const recorrentePadrao =
      tipo.natureza === FinanceiroDespesaNatureza.fixa ||
      tipo.natureza === FinanceiroDespesaNatureza.fixa_variavel;
    const recorrente = dto.recorrente ?? recorrentePadrao;
    if (
      recorrente &&
      tipo.natureza === FinanceiroDespesaNatureza.variavel
    ) {
      throw new BadRequestException(
        'Despesas variáveis não podem ser marcadas como recorrentes.',
      );
    }
    const row = await this.prisma.financeiroDespesa.create({
      data: {
        tenantId,
        tipoId: dto.tipoId,
        descricao: dto.descricao.trim(),
        valor: dto.valor,
        data: parseDayStart(dto.data),
        competencia,
        recorrente,
        observacao: dto.observacao?.trim() || '',
        ativo: dto.ativo ?? true,
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapDespesa(row);
  }

  async updateDespesa(
    id: string,
    dto: UpdateDespesaDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const existing = await this.findDespesaOrFail(id, requester);
    let tipoNatureza = existing.tipo.natureza;
    if (dto.tipoId) {
      const tipo = await this.findDespesaTipoOrFail(dto.tipoId, requester);
      if (!tipo.ativo) {
        throw new BadRequestException('Tipo de despesa inativo.');
      }
      tipoNatureza = tipo.natureza;
    }
    if (
      dto.recorrente === true &&
      tipoNatureza === FinanceiroDespesaNatureza.variavel
    ) {
      throw new BadRequestException(
        'Despesas variáveis não podem ser marcadas como recorrentes.',
      );
    }
    const dataIso =
      dto.data !== undefined ? dto.data.slice(0, 10) : isoDateOnly(existing.data);
    const competencia =
      dto.competencia?.trim() ||
      (dto.data !== undefined ? competenciaFromIsoDate(dataIso) : undefined);
    const row = await this.prisma.financeiroDespesa.update({
      where: { id },
      data: {
        ...(dto.tipoId !== undefined ? { tipoId: dto.tipoId } : {}),
        ...(dto.descricao !== undefined
          ? { descricao: dto.descricao.trim() }
          : {}),
        ...(dto.valor !== undefined ? { valor: dto.valor } : {}),
        ...(dto.data !== undefined ? { data: parseDayStart(dto.data) } : {}),
        ...(competencia !== undefined ? { competencia } : {}),
        ...(dto.recorrente !== undefined ? { recorrente: dto.recorrente } : {}),
        ...(dto.observacao !== undefined
          ? { observacao: dto.observacao.trim() }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true } },
      },
    });
    return this.mapDespesa(row);
  }

  async removeDespesa(id: string, requester: AuthenticatedUser) {
    this.assertWrite(requester);
    await this.findDespesaOrFail(id, requester);
    await this.prisma.financeiroDespesa.delete({ where: { id } });
    return { ok: true };
  }

  async renovarDespesasMes(
    dto: RenovarDespesasDto,
    requester: AuthenticatedUser,
  ) {
    this.assertWrite(requester);
    const tenantId = resolveFinanceiroTenantId(requester);
    const competencia = dto.competencia.trim();
    const [y, m] = competencia.split('-').map(Number);
    if (!y || !m) {
      throw new BadRequestException('Competência inválida.');
    }

    const raizes = await this.prisma.financeiroDespesa.findMany({
      where: {
        tenantId,
        ativo: true,
        recorrente: true,
        origemId: null,
        tipo: {
          natureza: {
            in: [
              FinanceiroDespesaNatureza.fixa,
              FinanceiroDespesaNatureza.fixa_variavel,
            ],
          },
        },
      },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
      orderBy: { data: 'desc' },
    });

    const criadas = [];
    let ignoradas = 0;

    for (const raiz of raizes) {
      if (!raiz.tipo.ativo) {
        ignoradas += 1;
        continue;
      }
      const serieIds = { OR: [{ id: raiz.id }, { origemId: raiz.id }] };
      const jaExiste = await this.prisma.financeiroDespesa.findFirst({
        where: {
          tenantId,
          competencia,
          ...serieIds,
        },
        select: { id: true },
      });
      if (jaExiste) {
        ignoradas += 1;
        continue;
      }

      const ultima = await this.prisma.financeiroDespesa.findFirst({
        where: { tenantId, ...serieIds },
        orderBy: [{ competencia: 'desc' }, { data: 'desc' }],
      });
      const template = ultima ?? raiz;
      const day = Math.min(
        Number(isoDateOnly(template.data).slice(8, 10)) || 1,
        28,
      );
      const row = await this.prisma.financeiroDespesa.create({
        data: {
          tenantId,
          tipoId: template.tipoId,
          descricao: template.descricao,
          valor: template.valor,
          data: dataFromCompetencia(competencia, day),
          competencia,
          recorrente: true,
          origemId: raiz.id,
          observacao: template.observacao,
          ativo: true,
        },
        include: {
          tipo: { select: { id: true, nome: true, natureza: true } },
        },
      });
      criadas.push(this.mapDespesa(row));
    }

    return {
      competencia,
      criadas: criadas.length,
      ignoradas,
      despesas: criadas,
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
    await this.ensureDefaultDespesaCategorias(tenantId);
    const competencia = competenciaAtualBrasil();
    const { gte, lt } = this.competenciaDateBounds(competencia);
    const tipos = await this.prisma.financeiroDespesaTipo.findMany({
      where: { tenantId, ativo: true },
      include: {
        despesas: {
          where: {
            ativo: true,
            OR: [
              { competencia },
              { competencia: '', data: { gte, lt } },
            ],
          },
          select: { valor: true },
        },
      },
      orderBy: { nome: 'asc' },
    });

    if (tipos.length > 0) {
      // Agrega por nome de categoria (soma naturezas do mesmo centro).
      const byName = new Map<
        string,
        {
          centro: string;
          natureza: FinanceiroDespesaNatureza | null;
          orcado: number;
          realizado: number;
        }
      >();
      for (const t of tipos) {
        const realizado = t.despesas.reduce((s, d) => s + d.valor, 0);
        const cur = byName.get(t.nome);
        if (cur) {
          cur.orcado += t.orcadoMensal;
          cur.realizado += realizado;
          if (cur.natureza !== t.natureza) cur.natureza = null;
        } else {
          byName.set(t.nome, {
            centro: t.nome,
            natureza: t.natureza,
            orcado: t.orcadoMensal,
            realizado,
          });
        }
      }
      return [...byName.values()]
        .map((c) => ({
          ...c,
          percentual: c.orcado
            ? (c.realizado / c.orcado) * 100
            : c.realizado > 0
              ? 100
              : 0,
        }))
        .filter((c) => c.realizado > 0 || c.orcado > 0)
        .sort((a, b) => b.realizado - a.realizado);
    }

    const rows = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        tipo: FinanceiroMovimentoTipo.saida,
        status: { not: FinanceiroTituloStatus.cancelado },
        data: { gte, lt },
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
        natureza: null as string | null,
        orcado: realizado,
        realizado,
        percentual: 100,
      }))
      .sort((a, b) => b.realizado - a.realizado);
  }

  private competenciaDateBounds(competencia: string) {
    const [ys, ms] = competencia.split('-').map(Number);
    const gte = new Date(Date.UTC(ys, ms - 1, 1) + BRASIL_UTC_OFFSET_MS);
    const lt = new Date(Date.UTC(ys, ms, 1) + BRASIL_UTC_OFFSET_MS);
    return { gte, lt };
  }

  private async ensureDefaultDespesaCategorias(tenantId: string) {
    const count = await this.prisma.financeiroDespesaTipo.count({
      where: { tenantId },
    });
    if (count > 0) return;
    const naturezas: FinanceiroDespesaNatureza[] = [
      FinanceiroDespesaNatureza.fixa,
      FinanceiroDespesaNatureza.fixa_variavel,
      FinanceiroDespesaNatureza.variavel,
    ];
    await this.prisma.financeiroDespesaTipo.createMany({
      data: naturezas.flatMap((natureza) =>
        DEFAULT_DESPESA_CATEGORIAS.map((nome) => ({
          tenantId,
          nome,
          natureza,
          orcadoMensal: 0,
          ativo: true,
        })),
      ),
      skipDuplicates: true,
    });
  }

  private async findMovimentoOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroMovimento.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Movimento não encontrado.');
    return row;
  }

  private async findTituloOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroTitulo.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Título não encontrado.');
    return row;
  }

  private async collectFluxoEventos(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<FluxoEvento[]> {
    const fromDate = parseDayStart(from);
    const toExclusive = parseDayEnd(to);

    const [movimentos, titulos] = await Promise.all([
      this.prisma.financeiroMovimento.findMany({
        where: {
          tenantId,
          status: { not: FinanceiroTituloStatus.cancelado },
          data: { gte: fromDate, lt: toExclusive },
        },
      }),
      this.prisma.financeiroTitulo.findMany({
        where: {
          tenantId,
          status: {
            in: [
              FinanceiroTituloStatus.aberto,
              FinanceiroTituloStatus.atrasado,
            ],
          },
          vencimento: { gte: fromDate, lt: toExclusive },
        },
      }),
    ]);

    const eventos: FluxoEvento[] = [];

    for (const m of movimentos) {
      const natureza =
        m.status === FinanceiroTituloStatus.pago ? 'realizado' : 'previsto';
      eventos.push({
        data: isoDateOnly(m.data),
        tipo: m.tipo === FinanceiroMovimentoTipo.entrada ? 'entrada' : 'saida',
        valor: m.valor,
        natureza,
        origem: 'movimento',
        id: m.id,
        descricao: m.descricao,
        parceiro: m.parceiroNome,
        categoria: m.categoria,
        centro: m.centro,
        status: m.status,
      });
    }

    for (const t of titulos) {
      eventos.push({
        data: isoDateOnly(t.vencimento),
        tipo: t.tipo === FinanceiroTituloTipo.receber ? 'entrada' : 'saida',
        valor: t.valor,
        natureza: 'previsto',
        origem: 'titulo',
        id: t.id,
        descricao: t.descricao,
        parceiro: t.parceiroNome,
        categoria: t.categoria,
        centro: t.centro,
        status: t.status,
      });
    }

    return eventos;
  }

  private bucketMetaForDate(
    iso: string,
    granularidade: FluxoGranularidade,
  ): { chave: string; inicio: string; fim: string; label: string } {
    if (granularidade === 'dia') {
      const [y, m, d] = iso.split('-').map(Number);
      const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
        'pt-BR',
        {
          timeZone: 'UTC',
          day: '2-digit',
          month: '2-digit',
        },
      );
      return { chave: iso, inicio: iso, fim: iso, label };
    }
    if (granularidade === 'semana') {
      const w = isoWeekKey(iso);
      return {
        ...w,
        label: `${w.inicio.slice(8)}/${w.inicio.slice(5, 7)} – ${w.fim.slice(8)}/${w.fim.slice(5, 7)}`,
      };
    }
    if (granularidade === 'mes') {
      const inicio = startOfMonthIso(iso);
      const fim = endOfMonthIso(iso);
      const m = Number(iso.slice(5, 7)) - 1;
      const y = iso.slice(0, 4);
      return {
        chave: iso.slice(0, 7),
        inicio,
        fim,
        label: `${MESES_CURTOS[m]}/${y}`,
      };
    }
    const q = quarterKey(iso);
    return {
      ...q,
      label: q.chave.replace('-', ' '),
    };
  }

  private buildFluxoBuckets(
    from: string,
    to: string,
    granularidade: FluxoGranularidade,
  ) {
    const seen = new Set<string>();
    const buckets: {
      chave: string;
      label: string;
      inicio: string;
      fim: string;
    }[] = [];

    let cursor = from;
    while (cursor <= to) {
      const meta = this.bucketMetaForDate(cursor, granularidade);
      if (!seen.has(meta.chave)) {
        seen.add(meta.chave);
        buckets.push({
          chave: meta.chave,
          label: meta.label,
          inicio: meta.inicio,
          fim: meta.fim,
        });
      }
      if (granularidade === 'dia') {
        cursor = addDaysIso(cursor, 1);
      } else if (granularidade === 'semana') {
        cursor = addDaysIso(meta.fim, 1);
      } else if (granularidade === 'mes') {
        const [y, m] = meta.inicio.split('-').map(Number);
        cursor = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
      } else {
        cursor = addDaysIso(meta.fim, 1);
      }
      if (buckets.length > 400) break;
    }
    return buckets;
  }

  private async findParceiroOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroParceiro.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Parceiro não encontrado.');
    return row;
  }

  private async findDespesaTipoOrFail(
    id: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroDespesaTipo.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Tipo de despesa não encontrado.');
    return row;
  }

  private async findDespesaOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroDespesa.findFirst({
      where: { id, tenantId },
      include: {
        tipo: { select: { id: true, nome: true, natureza: true, ativo: true } },
      },
    });
    if (!row) throw new NotFoundException('Despesa não encontrada.');
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

  /**
   * Saldo aberto = soma dos lançamentos em aberto/atrasado do parceiro.
   * Entrada soma (+); saída subtrai (−). Pago/cancelado não entra.
   */
  private sumSaldoPorParceiro(
    movimentos: {
      parceiroId: string | null;
      tipo: FinanceiroMovimentoTipo | string;
      valor: number;
    }[],
  ) {
    const map = new Map<string, number>();
    for (const m of movimentos) {
      if (!m.parceiroId) continue;
      const cur = map.get(m.parceiroId) ?? 0;
      map.set(
        m.parceiroId,
        m.tipo === FinanceiroMovimentoTipo.entrada
          ? cur + m.valor
          : cur - m.valor,
      );
    }
    return map;
  }

  private async recalcSaldoParceiro(
    tenantId: string,
    parceiroId: string | null | undefined,
  ) {
    if (!parceiroId) return;

    const movimentos = await this.prisma.financeiroMovimento.findMany({
      where: {
        tenantId,
        parceiroId,
        status: {
          in: [FinanceiroTituloStatus.aberto, FinanceiroTituloStatus.atrasado],
        },
      },
      select: { tipo: true, valor: true },
    });

    const saldoAberto = movimentos.reduce((acc, m) => {
      return m.tipo === FinanceiroMovimentoTipo.entrada
        ? acc + m.valor
        : acc - m.valor;
    }, 0);

    await this.prisma.financeiroParceiro.updateMany({
      where: { id: parceiroId, tenantId },
      data: { saldoAberto },
    });
  }

  private mapParceiro(row: {
    id: string;
    nome: string;
    documento: string;
    tipo: string;
    email: string | null;
    telefone: string | null;
    cidade: string | null;
    imobiliaria?: string | null;
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
      imobiliaria: row.imobiliaria ?? '',
      saldoAberto: row.saldoAberto,
      ativo: row.ativo,
    };
  }

  private mapDespesaTipo(row: {
    id: string;
    nome: string;
    natureza: FinanceiroDespesaNatureza;
    orcadoMensal: number;
    ativo: boolean;
    createdAt: Date;
    _count?: { despesas: number };
    despesas?: { valor: number }[];
  }) {
    const realizado = (row.despesas ?? []).reduce((s, d) => s + d.valor, 0);
    return {
      id: row.id,
      nome: row.nome,
      natureza: row.natureza,
      orcadoMensal: row.orcadoMensal,
      realizado,
      qtdDespesas: row._count?.despesas ?? row.despesas?.length ?? 0,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapDespesa(row: {
    id: string;
    tipoId: string;
    descricao: string;
    valor: number;
    data: Date;
    competencia?: string | null;
    recorrente?: boolean;
    origemId?: string | null;
    observacao: string;
    ativo: boolean;
    createdAt: Date;
    tipo: { id: string; nome: string; natureza: FinanceiroDespesaNatureza };
  }) {
    return {
      id: row.id,
      tipoId: row.tipoId,
      tipoNome: row.tipo.nome,
      natureza: row.tipo.natureza,
      descricao: row.descricao,
      valor: row.valor,
      data: isoDateOnly(row.data),
      competencia:
        row.competencia?.trim() || competenciaFromIsoDate(isoDateOnly(row.data)),
      recorrente: row.recorrente ?? false,
      origemId: row.origemId ?? null,
      observacao: row.observacao,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
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
    tituloId?: string | null;
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
      tituloId: row.tituloId ?? null,
    };
  }

  private mapTitulo(row: {
    id: string;
    tipo: string;
    descricao: string;
    parceiroId: string | null;
    parceiroNome: string;
    categoria: string;
    centro: string;
    vencimento: Date;
    dataPagamento?: Date | null;
    valor: number;
    status: string;
    parcela: string;
    grupoParcelasId?: string | null;
    movimento?: { formaPagamento: string } | null;
  }) {
    return {
      id: row.id,
      tipo: row.tipo,
      descricao: row.descricao,
      parceiroId: row.parceiroId,
      parceiro: row.parceiroNome,
      categoria: row.categoria,
      centro: row.centro,
      vencimento: isoDateOnly(row.vencimento),
      dataPagamento: row.dataPagamento ? isoDateOnly(row.dataPagamento) : null,
      valor: row.valor,
      status: row.status,
      parcela: row.parcela,
      grupoParcelasId: row.grupoParcelasId ?? null,
      formaPagamento: row.movimento?.formaPagamento || '',
    };
  }

  private mapComissao(
    row: Prisma.FinanceiroComissaoGetPayload<Record<string, never>>,
    requester: AuthenticatedUser,
  ) {
    const result = {
      ...row,
      dataVenda: isoDateOnly(row.dataVenda),
      vgv: Number(row.vgv),
      percentualImobiliaria: Number(row.percentualImobiliaria),
      comissaoBruta: Number(row.comissaoBruta),
      percentualTributos: Number(row.percentualTributos),
      valorTributos: Number(row.valorTributos),
      comissaoLiquida: Number(row.comissaoLiquida),
      percentualCorretor: Number(row.percentualCorretor),
      valorCorretor: Number(row.valorCorretor),
      percentualGerente: Number(row.percentualGerente),
      valorGerente: Number(row.valorGerente),
      percentualCaixa: Number(row.percentualCaixa),
      valorCaixa: Number(row.valorCaixa),
      percentualSocios: Number(row.percentualSocios),
      valorSocios: Number(row.valorSocios),
    };
    if (requester.role === Role.corretor) {
      const {
        percentualTributos: _percentualTributos,
        valorTributos: _valorTributos,
        comissaoLiquida: _comissaoLiquida,
        percentualGerente: _percentualGerente,
        valorGerente: _valorGerente,
        percentualCaixa: _percentualCaixa,
        valorCaixa: _valorCaixa,
        percentualSocios: _percentualSocios,
        valorSocios: _valorSocios,
        ...corretorResult
      } = result;
      return corretorResult;
    }
    if (requester.role === Role.gerente) {
      const {
        percentualCaixa: _percentualCaixa,
        valorCaixa: _valorCaixa,
        percentualSocios: _percentualSocios,
        valorSocios: _valorSocios,
        ...publicResult
      } = result;
      return publicResult;
    }
    return result;
  }

  private calculateComissao(
    vgv: number,
    input: {
      percentualImobiliaria: number;
      percentualTributos: number;
      percentualCorretor: number;
      percentualGerente: number;
      percentualCaixa: number;
      percentualSocios: number;
    },
  ) {
    const splitTotal =
      input.percentualCorretor +
      input.percentualGerente +
      input.percentualCaixa +
      input.percentualSocios;
    if (Math.abs(splitTotal - 100) > 0.0001) {
      throw new BadRequestException(
        'Os percentuais da comissão líquida devem somar 100%.',
      );
    }
    const decimal = (value: number) => new Prisma.Decimal(value.toString());
    const percent = (value: number) => decimal(value).div(100);
    const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2);
    const vgvDecimal = money(decimal(vgv));
    const comissaoBruta = money(
      vgvDecimal.mul(percent(input.percentualImobiliaria)),
    );
    const valorTributos = money(
      comissaoBruta.mul(percent(input.percentualTributos)),
    );
    const comissaoLiquida = money(comissaoBruta.minus(valorTributos));
    const valorCorretor = money(
      comissaoLiquida.mul(percent(input.percentualCorretor)),
    );
    const valorGerente = money(
      comissaoLiquida.mul(percent(input.percentualGerente)),
    );
    const valorCaixa = money(
      comissaoLiquida.mul(percent(input.percentualCaixa)),
    );
    // O último split absorve eventual centavo residual do arredondamento.
    const valorSocios = money(
      comissaoLiquida
        .minus(valorCorretor)
        .minus(valorGerente)
        .minus(valorCaixa),
    );
    return {
      vgv: vgvDecimal,
      percentualImobiliaria: input.percentualImobiliaria,
      comissaoBruta,
      percentualTributos: input.percentualTributos,
      valorTributos,
      comissaoLiquida,
      percentualCorretor: input.percentualCorretor,
      valorCorretor,
      percentualGerente: input.percentualGerente,
      valorGerente,
      percentualCaixa: input.percentualCaixa,
      valorCaixa,
      percentualSocios: input.percentualSocios,
      valorSocios,
    };
  }

  private async findComissaoOrFail(id: string, requester: AuthenticatedUser) {
    const tenantId = resolveFinanceiroTenantId(requester);
    const row = await this.prisma.financeiroComissao.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Comissão não encontrada.');
    return row;
  }

  private assertComissaoAccess(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.corretor &&
      requester.role !== Role.super_admin
    ) {
      throw new ForbiddenException('Você não possui acesso às comissões.');
    }
  }

  private assertComissaoWrite(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.super_admin) {
      throw new ForbiddenException(
        'Somente administradores gerenciam comissões.',
      );
    }
  }

  private assertAccess(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.super_admin
    ) {
      throw new ForbiddenException(
        'Módulo financeiro disponível para admin, gerente e super admin.',
      );
    }
  }

  private assertWrite(requester: AuthenticatedUser) {
    this.assertAccess(requester);
  }
}
