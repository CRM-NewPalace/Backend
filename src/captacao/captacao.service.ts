import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CaptacaoHistoricoTipo,
  FunilTipo,
  PessoaTipo,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { imovelTitulo } from './captacao.constants';
import {
  moneyEqual,
  pickFirstActiveEtapa,
  toMoneyNumber,
  normalizeCpfCnpj,
  assertCpfCnpj,
} from './captacao.util';
import {
  textoCriacao,
  textoEdicao,
  textoEtapa,
  textoExclusividade,
  textoResponsavel,
  textoValorAvaliacao,
  textoValorPretendido,
} from './captacao-history.util';
import {
  CreateProprietarioDto,
  QueryProprietariosDto,
  UpdateProprietarioDto,
} from './dto/proprietario.dto';
import {
  CreateImovelDto,
  QueryImoveisDto,
  UpdateImovelDto,
} from './dto/imovel.dto';
import {
  CreateCaptacaoDto,
  QueryCaptacoesDto,
  UpdateCaptacaoDto,
} from './dto/captacao.dto';

const SEM_FUNIL =
  'Não existe um funil de Captação ativo para este Tenant.';

const proprietarioSelect = {
  id: true,
  nome: true,
  tipoPessoa: true,
  cpfCnpj: true,
  telefone: true,
  email: true,
  observacoes: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { imoveis: true, captacoes: true } },
} as const;

const imovelInclude = {
  proprietario: { select: { id: true, nome: true, telefone: true, email: true } },
  captacoes: {
    select: {
      id: true,
      valorPretendido: true,
      funilEtapa: { select: { id: true, label: true, papel: true } },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const;

const captacaoInclude = {
  proprietario: {
    select: { id: true, nome: true, telefone: true, email: true, tipoPessoa: true },
  },
  imovel: true,
  responsavel: { select: { id: true, name: true, email: true } },
  funil: { select: { id: true, name: true, tipo: true, ativo: true } },
  funilEtapa: {
    select: {
      id: true,
      label: true,
      slug: true,
      color: true,
      sortOrder: true,
      papel: true,
      active: true,
    },
  },
} as const;

@Injectable()
export class CaptacaoService {
  constructor(private readonly prisma: PrismaService) {}

  listProprietarios(query: QueryProprietariosDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.ProprietarioWhereInput = { tenantId };
    if (query.search) {
      where.OR = [
        { nome: { contains: query.search, mode: 'insensitive' } },
        { telefone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { cpfCnpj: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.proprietario.findMany({
      where,
      select: proprietarioSelect,
      orderBy: { nome: 'asc' },
    });
  }

  async getProprietario(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
      include: {
        imoveis: {
          orderBy: { createdAt: 'desc' },
          include: imovelInclude,
        },
        _count: { select: { imoveis: true, captacoes: true } },
      },
    });
    if (!item) throw new NotFoundException('Proprietário não encontrado.');
    return {
      ...item,
      imoveis: item.imoveis.map((imovel) => this.exposeImovel(imovel)),
    };
  }

  createProprietario(dto: CreateProprietarioDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const tipoPessoa = dto.tipoPessoa ?? PessoaTipo.fisica;
    const cpfCnpj = normalizeCpfCnpj(dto.cpfCnpj, tipoPessoa);
    assertCpfCnpj(cpfCnpj, tipoPessoa);
    return this.prisma.proprietario.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        tipoPessoa,
        cpfCnpj,
        telefone: dto.telefone?.trim() ?? '',
        email: dto.email?.trim() ?? '',
        observacoes: dto.observacoes?.trim() ?? '',
      },
      select: proprietarioSelect,
    });
  }

  async updateProprietario(
    id: string,
    dto: UpdateProprietarioDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.getProprietario(id, user);
    const tipoPessoa = dto.tipoPessoa ?? current.tipoPessoa;
    const cpfCnpj =
      dto.cpfCnpj != null
        ? normalizeCpfCnpj(dto.cpfCnpj, tipoPessoa)
        : undefined;
    if (cpfCnpj != null) assertCpfCnpj(cpfCnpj, tipoPessoa);
    return this.prisma.proprietario.update({
      where: { id },
      data: {
        ...(dto.nome != null ? { nome: dto.nome.trim() } : {}),
        ...(dto.tipoPessoa != null ? { tipoPessoa: dto.tipoPessoa } : {}),
        ...(cpfCnpj != null ? { cpfCnpj } : {}),
        ...(dto.telefone != null ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email != null ? { email: dto.email.trim() } : {}),
        ...(dto.observacoes != null
          ? { observacoes: dto.observacoes.trim() }
          : {}),
      },
      select: proprietarioSelect,
    });
  }

  async listImoveis(query: QueryImoveisDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.ImovelWhereInput = { tenantId };
    if (query.proprietarioId) where.proprietarioId = query.proprietarioId;
    if (query.tipo) where.tipo = query.tipo;
    if (query.cidade) {
      where.cidade = { contains: query.cidade, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { logradouro: { contains: query.search, mode: 'insensitive' } },
        { bairro: { contains: query.search, mode: 'insensitive' } },
        { cidade: { contains: query.search, mode: 'insensitive' } },
        { proprietario: { nome: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const items = await this.prisma.imovel.findMany({
      where,
      include: imovelInclude,
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.exposeImovel(item));
  }

  async getImovel(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      include: {
        ...imovelInclude,
        captacoes: {
          include: {
            funilEtapa: { select: { id: true, label: true, papel: true } },
            responsavel: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Imóvel não encontrado.');
    return this.exposeImovel(item);
  }

  async createImovel(dto: CreateImovelDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireProprietario(dto.proprietarioId, tenantId);
    const created = await this.prisma.imovel.create({
      data: {
        tenantId,
        proprietarioId: dto.proprietarioId,
        tipo: dto.tipo,
        cep: dto.cep?.trim() ?? '',
        logradouro: dto.logradouro?.trim() ?? '',
        numero: dto.numero?.trim() ?? '',
        complemento: dto.complemento?.trim() ?? '',
        bairro: dto.bairro?.trim() ?? '',
        cidade: dto.cidade?.trim() ?? '',
        estado: dto.estado?.trim().toUpperCase() ?? '',
        area: dto.area,
        areaConstruida: dto.areaConstruida,
        quartos: dto.quartos,
        suites: dto.suites,
        banheiros: dto.banheiros,
        vagas: dto.vagas,
        observacoes: dto.observacoes?.trim() ?? '',
      },
      include: imovelInclude,
    });
    return this.exposeImovel(created);
  }

  async updateImovel(id: string, dto: UpdateImovelDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Imóvel não encontrado.');
    if (dto.proprietarioId) {
      await this.requireProprietario(dto.proprietarioId, tenantId);
    }
    const updated = await this.prisma.imovel.update({
      where: { id },
      data: {
        ...(dto.proprietarioId ? { proprietarioId: dto.proprietarioId } : {}),
        ...(dto.tipo ? { tipo: dto.tipo } : {}),
        ...(dto.cep != null ? { cep: dto.cep.trim() } : {}),
        ...(dto.logradouro != null ? { logradouro: dto.logradouro.trim() } : {}),
        ...(dto.numero != null ? { numero: dto.numero.trim() } : {}),
        ...(dto.complemento != null
          ? { complemento: dto.complemento.trim() }
          : {}),
        ...(dto.bairro != null ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.cidade != null ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.estado != null
          ? { estado: dto.estado.trim().toUpperCase() }
          : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
        ...(dto.areaConstruida !== undefined
          ? { areaConstruida: dto.areaConstruida }
          : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.suites !== undefined ? { suites: dto.suites } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.vagas !== undefined ? { vagas: dto.vagas } : {}),
        ...(dto.observacoes != null
          ? { observacoes: dto.observacoes.trim() }
          : {}),
      },
      include: imovelInclude,
    });
    return this.exposeImovel(updated);
  }

  async listCaptacoes(query: QueryCaptacoesDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.CaptacaoWhereInput = { tenantId };
    if (query.proprietarioId) where.proprietarioId = query.proprietarioId;
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    if (query.funilEtapaId) where.funilEtapaId = query.funilEtapaId;
    if (query.origem) {
      where.origem = { contains: query.origem, mode: 'insensitive' };
    }
    if (typeof query.exclusividade === 'boolean') {
      where.exclusividade = query.exclusividade;
    }
    const imovelFilter: Prisma.ImovelWhereInput = {};
    if (query.tipo) imovelFilter.tipo = query.tipo;
    if (query.cidade) {
      imovelFilter.cidade = { contains: query.cidade, mode: 'insensitive' };
    }
    if (query.tipo || query.cidade) where.imovel = imovelFilter;
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) where.createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) {
        const end = new Date(query.createdTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    const items = await this.prisma.captacao.findMany({
      where,
      include: captacaoInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((item) => this.exposeCaptacao(item));
  }

  async getCaptacao(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.captacao.findFirst({
      where: { id, tenantId },
      include: {
        ...captacaoInclude,
        historicos: {
          orderBy: { createdAt: 'desc' },
          include: { autor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Captação não encontrada.');
    return this.exposeCaptacao(item);
  }

  async createCaptacao(dto: CreateCaptacaoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const proprietario = await this.requireProprietario(
      dto.proprietarioId,
      tenantId,
    );
    const imovel = await this.requireImovel(dto.imovelId, tenantId);
    if (imovel.proprietarioId !== proprietario.id) {
      throw new BadRequestException(
        'O imóvel não pertence ao proprietário informado.',
      );
    }
    await this.requireResponsavel(dto.responsavelId, tenantId);
    const funil = await this.resolveFunilCaptacao(tenantId, dto.funilId);
    const etapa = await this.resolveEtapa(funil, dto.funilEtapaId);

    const created = await this.prisma.$transaction(async (tx) => {
      const captacao = await tx.captacao.create({
        data: {
          tenantId,
          proprietarioId: dto.proprietarioId,
          imovelId: dto.imovelId,
          responsavelId: dto.responsavelId,
          origem: dto.origem?.trim() ?? '',
          exclusividade: dto.exclusividade ?? false,
          valorPretendido: dto.valorPretendido,
          valorAvaliacao: dto.valorAvaliacao,
          funilId: funil.id,
          funilEtapaId: etapa.id,
        },
        include: captacaoInclude,
      });
      await tx.captacaoHistorico.create({
        data: {
          tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.criacao,
          texto: textoCriacao(user.name),
          autorId: user.id,
        },
      });
      return captacao;
    });
    return this.getCaptacao(created.id, user);
  }

  async updateCaptacao(
    id: string,
    dto: UpdateCaptacaoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.captacao.findFirst({
      where: { id, tenantId },
      include: {
        funilEtapa: true,
        funil: { include: { etapas: true } },
        responsavel: { select: { id: true, name: true } },
      },
    });
    if (!current) throw new NotFoundException('Captação não encontrada.');

    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    let nextEtapaId = current.funilEtapaId;
    let nextEtapaLabel = current.funilEtapa.label;
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      const etapa = await this.resolveEtapa(current.funil, dto.funilEtapaId);
      nextEtapaId = etapa.id;
      nextEtapaLabel = etapa.label;
    }

    const historicos: Array<{
      tipo: CaptacaoHistoricoTipo;
      texto: string;
      autorId: string;
    }> = [];
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.etapa,
        texto: textoEtapa(user.name, current.funilEtapa.label, nextEtapaLabel),
        autorId: user.id,
      });
    }
    if (dto.responsavelId && dto.responsavelId !== current.responsavelId) {
      const novo = await this.prisma.user.findFirst({
        where: { id: dto.responsavelId, tenantId },
        select: { name: true },
      });
      historicos.push({
        tipo: CaptacaoHistoricoTipo.responsavel,
        texto: textoResponsavel(novo?.name ?? user.name),
        autorId: user.id,
      });
    }
    if (
      dto.valorPretendido !== undefined &&
      !moneyEqual(
        toMoneyNumber(current.valorPretendido),
        dto.valorPretendido,
      )
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.valor,
        texto: textoValorPretendido(),
        autorId: user.id,
      });
    }
    if (
      dto.valorAvaliacao !== undefined &&
      !moneyEqual(toMoneyNumber(current.valorAvaliacao), dto.valorAvaliacao)
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.valor,
        texto: textoValorAvaliacao(),
        autorId: user.id,
      });
    }
    if (
      typeof dto.exclusividade === 'boolean' &&
      dto.exclusividade !== current.exclusividade
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.exclusividade,
        texto: textoExclusividade(dto.exclusividade),
        autorId: user.id,
      });
    }
    if (dto.origem != null && dto.origem.trim() !== current.origem) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.edicao,
        texto: textoEdicao(user.name),
        autorId: user.id,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.captacao.update({
        where: { id },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.origem != null ? { origem: dto.origem.trim() } : {}),
          ...(typeof dto.exclusividade === 'boolean'
            ? { exclusividade: dto.exclusividade }
            : {}),
          ...(dto.valorPretendido !== undefined
            ? { valorPretendido: dto.valorPretendido }
            : {}),
          ...(dto.valorAvaliacao !== undefined
            ? { valorAvaliacao: dto.valorAvaliacao }
            : {}),
          funilEtapaId: nextEtapaId,
        },
      });
      if (historicos.length) {
        await tx.captacaoHistorico.createMany({
          data: historicos.map((h) => ({
            tenantId,
            captacaoId: id,
            tipo: h.tipo,
            texto: h.texto,
            autorId: h.autorId,
          })),
        });
      }
    });
    return this.getCaptacao(id, user);
  }

  async resumo(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const [proprietarios, imoveis, captacoes, porEtapa] = await Promise.all([
      this.prisma.proprietario.count({ where: { tenantId } }),
      this.prisma.imovel.count({ where: { tenantId } }),
      this.prisma.captacao.count({ where: { tenantId } }),
      this.prisma.captacao.groupBy({
        by: ['funilEtapaId'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const etapas = await this.prisma.funilEtapa.findMany({
      where: { id: { in: porEtapa.map((r) => r.funilEtapaId) } },
      select: { id: true, label: true, papel: true, sortOrder: true, color: true },
    });
    const etapaMap = new Map(etapas.map((e) => [e.id, e]));
    let ativas = 0;
    let captados = 0;
    const porEtapaOut = porEtapa
      .map((row) => {
        const etapa = etapaMap.get(row.funilEtapaId);
        const count = row._count._all;
        if (etapa?.papel === 'venda') captados += count;
        else if (etapa?.papel !== 'perdido') ativas += count;
        return {
          funilEtapaId: row.funilEtapaId,
          label: etapa?.label ?? 'Etapa',
          papel: etapa?.papel ?? null,
          color: etapa?.color ?? null,
          sortOrder: etapa?.sortOrder ?? 0,
          total: count,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      proprietarios,
      imoveis,
      captacoes,
      captacoesAtivas: ativas,
      imoveisCaptados: captados,
      porEtapa: porEtapaOut,
    };
  }

  listResponsaveis(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.user.findMany({
      where: { tenantId, status: UserStatus.ativo },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  private async requireProprietario(id: string, tenantId: string) {
    const item = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new BadRequestException(
        'O proprietário não pertence a esta imobiliária.',
      );
    }
    return item;
  }

  private async requireImovel(id: string, tenantId: string) {
    const item = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new BadRequestException('O imóvel não pertence a esta imobiliária.');
    }
    return item;
  }

  private async requireResponsavel(id: string, tenantId: string) {
    const item = await this.prisma.user.findFirst({
      where: { id, tenantId, status: UserStatus.ativo },
    });
    if (!item) {
      throw new BadRequestException(
        'O responsável deve ser um usuário ativo desta imobiliária.',
      );
    }
    return item;
  }

  private async resolveFunilCaptacao(tenantId: string, funilId?: string) {
    if (funilId) {
      const funil = await this.prisma.funil.findFirst({
        where: { id: funilId, tenantId },
        include: { etapas: true },
      });
      if (!funil) throw new BadRequestException('Funil não encontrado.');
      if (funil.tipo !== FunilTipo.captacao) {
        throw new BadRequestException(
          'A captação só pode usar um funil do tipo Captação.',
        );
      }
      return funil;
    }
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.captacao, ativo: true },
      include: { etapas: true },
    });
    if (!funil) throw new BadRequestException(SEM_FUNIL);
    return funil;
  }

  private async resolveEtapa(
    funil: { id: string; etapas: Array<{ id: string; sortOrder: number; active: boolean; label: string }> },
    funilEtapaId?: string,
  ) {
    if (funilEtapaId) {
      const etapa = funil.etapas.find((e) => e.id === funilEtapaId);
      if (!etapa) {
        throw new BadRequestException(
          'A etapa não pertence ao funil de Captação selecionado.',
        );
      }
      return etapa;
    }
    const first = pickFirstActiveEtapa(funil.etapas);
    if (!first) {
      throw new BadRequestException(
        'O funil de Captação ativo não possui etapas.',
      );
    }
    return first;
  }

  private exposeImovel(item: {
    tipo: Prisma.ImovelGetPayload<{ include: typeof imovelInclude }>['tipo'];
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    area: unknown;
    areaConstruida: unknown;
    captacoes?: Array<{
      id: string;
      valorPretendido?: unknown;
      funilEtapa?: { id: string; label: string; papel?: string | null };
    }>;
    [key: string]: unknown;
  }) {
    const ultima = item.captacoes?.[0];
    return {
      ...item,
      area: toMoneyNumber(item.area as never),
      areaConstruida: toMoneyNumber(item.areaConstruida as never),
      titulo: imovelTitulo(item),
      valor: toMoneyNumber(ultima?.valorPretendido as never),
      captacao: ultima
        ? {
            id: ultima.id,
            etapa: ultima.funilEtapa?.label ?? null,
          }
        : null,
    };
  }

  private exposeCaptacao(item: {
    valorPretendido: unknown;
    valorAvaliacao: unknown;
    imovel: {
      tipo: Prisma.ImovelGetPayload<object>['tipo'];
      logradouro: string;
      numero: string;
      bairro: string;
      cidade: string;
      area: unknown;
      areaConstruida: unknown;
    };
    [key: string]: unknown;
  }) {
    return {
      ...item,
      valorPretendido: toMoneyNumber(item.valorPretendido as never),
      valorAvaliacao: toMoneyNumber(item.valorAvaliacao as never),
      imovel: {
        ...item.imovel,
        area: toMoneyNumber(item.imovel.area as never),
        areaConstruida: toMoneyNumber(item.imovel.areaConstruida as never),
        titulo: imovelTitulo(item.imovel),
      },
    };
  }
}
