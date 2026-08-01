import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentacaoStatus2,
  MetaOrigem,
  MetaPeriodo,
  MetaTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { TeamScopeService } from '../equipes/team-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMetaDto } from './dto/create-meta.dto';
import { UpdateMetaDto } from './dto/update-meta.dto';

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class MetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const agora = new Date();
    const corretorIds = await this.getCorretorIdsVisiveis(requester);
    const metas = await this.prisma.meta.findMany({
      where: {
        tenantId,
        ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
        inicio: { lte: agora },
        fim: { gt: agora },
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
        criador: { select: { id: true, name: true } },
      },
      orderBy: [{ corretor: { name: 'asc' } }, { periodo: 'asc' }, { tipo: 'asc' }],
    });

    return Promise.all(metas.map((meta) => this.withProgress(meta, tenantId)));
  }

  async create(dto: CreateMetaDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const definicao = this.getDefinicaoPeriodo(dto.periodo);
    const { corretorId, origem } = await this.getDestinoCriacao(dto, requester);

    const meta = await this.prisma.meta.upsert({
      where: {
        corretorId_origem_tipo_periodo_inicio: {
          corretorId,
          origem,
          tipo: dto.tipo as MetaTipo,
          periodo: dto.periodo as MetaPeriodo,
          inicio: definicao.inicio,
        },
      },
      create: {
        tenantId,
        corretorId,
        criadorId: requester.id,
        origem,
        tipo: dto.tipo as MetaTipo,
        periodo: dto.periodo as MetaPeriodo,
        valor: dto.valor,
        ...definicao,
      },
      update: { valor: dto.valor, criadorId: requester.id, fim: definicao.fim },
      include: {
        corretor: {
          select: {
            id: true,
            name: true,
            equipeId: true,
            equipe: { select: { id: true, name: true } },
          },
        },
        criador: { select: { id: true, name: true } },
      },
    });
    return this.withProgress(meta, tenantId);
  }

  async update(id: string, dto: UpdateMetaDto, requester: AuthenticatedUser) {
    const meta = await this.findEditable(id, requester);
    return this.prisma.meta.update({
      where: { id: meta.id },
      data: { valor: dto.valor },
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const meta = await this.findEditable(id, requester);
    await this.prisma.meta.delete({ where: { id: meta.id } });
    return { ok: true };
  }

  private async getDestinoCriacao(
    dto: CreateMetaDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    if (requester.role === Role.corretor) {
      return { corretorId: requester.id, origem: MetaOrigem.pessoal };
    }
    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Somente corretores e gerentes criam metas.');
    }
    if (!dto.corretorId) {
      throw new ForbiddenException('Selecione um corretor da sua equipe.');
    }
    if (!(await this.teamScope.canAccessCorretor(requester, dto.corretorId))) {
      throw new ForbiddenException(
        'Você só pode atribuir metas aos corretores da sua equipe.',
      );
    }
    const corretor = await this.prisma.user.findFirst({
      where: {
        id: dto.corretorId,
        tenantId,
        role: Role.corretor,
        status: UserStatus.ativo,
      },
      select: { id: true },
    });
    if (!corretor) {
      throw new NotFoundException('Corretor ativo não encontrado.');
    }
    return { corretorId: dto.corretorId, origem: MetaOrigem.gerente };
  }

  private async getCorretorIdsVisiveis(requester: AuthenticatedUser) {
    if (requester.role === Role.admin) return null;
    if (requester.role === Role.corretor) return [requester.id];
    if (requester.role === Role.gerente) {
      return (await this.teamScope.getVisibleCorretorIds(requester)) ?? [];
    }
    throw new ForbiddenException('Sem permissão para visualizar metas.');
  }

  private async findEditable(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const meta = await this.prisma.meta.findFirst({
      where: { id, tenantId },
    });
    if (!meta) throw new NotFoundException('Meta não encontrada.');

    const podeEditarPessoal =
      requester.role === Role.corretor &&
      meta.corretorId === requester.id &&
      meta.origem === MetaOrigem.pessoal;
    const podeEditarAtribuida =
      requester.role === Role.gerente &&
      meta.criadorId === requester.id &&
      meta.origem === MetaOrigem.gerente &&
      (await this.teamScope.canAccessCorretor(requester, meta.corretorId));

    if (!podeEditarPessoal && !podeEditarAtribuida) {
      throw new ForbiddenException('Você não pode alterar esta meta.');
    }
    return meta;
  }

  private getDefinicaoPeriodo(periodo: string) {
    const dataBrasil = new Date(Date.now() - BRASIL_UTC_OFFSET_MS);
    const ano = dataBrasil.getUTCFullYear();
    const mes = dataBrasil.getUTCMonth();
    const dia = dataBrasil.getUTCDate();
    let inicioLocal: Date;
    let fimLocal: Date;

    if (periodo === MetaPeriodo.diaria) {
      inicioLocal = new Date(Date.UTC(ano, mes, dia));
      fimLocal = new Date(Date.UTC(ano, mes, dia + 1));
    } else if (periodo === MetaPeriodo.semanal) {
      const segunda = dia - ((dataBrasil.getUTCDay() + 6) % 7);
      inicioLocal = new Date(Date.UTC(ano, mes, segunda));
      fimLocal = new Date(Date.UTC(ano, mes, segunda + 7));
    } else {
      inicioLocal = new Date(Date.UTC(ano, mes, 1));
      fimLocal = new Date(Date.UTC(ano, mes + 1, 1));
    }

    return {
      inicio: new Date(inicioLocal.getTime() + BRASIL_UTC_OFFSET_MS),
      fim: new Date(fimLocal.getTime() + BRASIL_UTC_OFFSET_MS),
    };
  }

  private async withProgress<T extends { corretorId: string; tipo: MetaTipo; inicio: Date; fim: Date; valor: number }>(
    meta: T,
    tenantId: string,
  ) {
    const where = {
      tenantId,
      corretorId: meta.corretorId,
      dataVenda: { gte: meta.inicio, lt: meta.fim },
      status2: DocumentacaoStatus2.vendido,
    };
    let atual = 0;

    if (meta.tipo === MetaTipo.documentacoes) {
      atual = await this.prisma.documentacao.count({
        where: {
          tenantId,
          corretorId: meta.corretorId,
          createdAt: { gte: meta.inicio, lt: meta.fim },
        },
      });
    } else if (meta.tipo === MetaTipo.vendas) {
      atual = await this.prisma.documentacao.count({ where });
    } else {
      const resultado = await this.prisma.documentacao.aggregate({
        where,
        _sum: { vgv: true },
      });
      atual = resultado._sum.vgv ?? 0;
    }

    return {
      ...meta,
      atual,
      percentual: Math.min(100, Math.round((atual / meta.valor) * 100)),
    };
  }
}
