import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CreateDocumentacaoDto } from './dto/create-documentacao.dto';
import { UpdateDocumentacaoDto } from './dto/update-documentacao.dto';
import { QueryDocumentacaoDto } from './dto/query-documentacao.dto';

const userMini = { select: { id: true, name: true } } as const;

const docSelect = {
  id: true,
  leadId: true,
  tipoContato: true,
  stageSituacao: true,
  nome: true,
  construtoraId: true,
  empreendimentoId: true,
  fonte: true,
  status1: true,
  status2: true,
  corretorId: true,
  gerenteId: true,
  dataAnalise: true,
  dataVenda: true,
  vgv: true,
  obs: true,
  createdAt: true,
  updatedAt: true,
  autor: userMini,
  construtora: { select: { id: true, nome: true } },
  empreendimento: { select: { id: true, nome: true, cidade: true } },
  corretor: userMini,
  gerente: userMini,
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      corretorId: true,
      corretor: userMini,
    },
  },
} as const;

function parseOptionalDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return new Date(value);
}

/** Compara status1 com "Análise" ignorando acento/caixa. */
function isStatusAnalise(status: string): boolean {
  return status
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .startsWith('analise');
}

function todayDateOnly(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

@Injectable()
export class DocumentacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async list(query: QueryDocumentacaoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
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

    return this.prisma.documentacao.findMany({
      where: { tenantId, lead: leadFilter },
      select: docSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const doc = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: docSelect,
    });
    if (!doc) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(doc.leadId, requester);
    return doc;
  }

  async create(dto: CreateDocumentacaoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const lead = await this.ensureLeadAccessible(dto.leadId, requester);

    const corretorId = dto.corretorId || lead.corretorId || null;
    let gerenteId = dto.gerenteId ?? null;
    if (!gerenteId && corretorId) {
      gerenteId = await this.resolveGerenteOfCorretor(corretorId, tenantId);
    }

    const status1 = dto.status1.trim();
    const parsedAnalise = parseOptionalDate(dto.dataAnalise);
    const dataAnalise =
      parsedAnalise ?? (isStatusAnalise(status1) ? todayDateOnly() : null);

    return this.prisma.documentacao.create({
      data: {
        tenantId,
        leadId: lead.id,
        autorId: requester.id,
        tipoContato: lead.tipo,
        stageSituacao: lead.stage,
        nome: dto.nome.trim(),
        construtoraId: dto.construtoraId || lead.construtoraId || null,
        empreendimentoId:
          dto.empreendimentoId || lead.empreendimentoId || null,
        fonte: dto.fonte.trim(),
        status1,
        status2: dto.status2.trim(),
        corretorId,
        gerenteId,
        dataAnalise,
        dataVenda: parseOptionalDate(dto.dataVenda) ?? null,
        vgv: dto.vgv ?? null,
        obs: dto.obs?.trim() || null,
      },
      select: docSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateDocumentacaoDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        dataAnalise: true,
        corretorId: true,
        gerenteId: true,
        status1: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    const data: Prisma.DocumentacaoUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.construtoraId !== undefined) {
      data.construtora = dto.construtoraId
        ? { connect: { id: dto.construtoraId } }
        : { disconnect: true };
    }
    if (dto.empreendimentoId !== undefined) {
      data.empreendimento = dto.empreendimentoId
        ? { connect: { id: dto.empreendimentoId } }
        : { disconnect: true };
    }
    if (dto.fonte !== undefined) data.fonte = dto.fonte.trim();
    if (dto.status1 !== undefined) data.status1 = dto.status1.trim();
    if (dto.status2 !== undefined) data.status2 = dto.status2.trim();
    if (dto.corretorId !== undefined) {
      data.corretor = dto.corretorId
        ? { connect: { id: dto.corretorId } }
        : { disconnect: true };
    }
    if (dto.gerenteId !== undefined) {
      if (dto.gerenteId) {
        data.gerente = { connect: { id: dto.gerenteId } };
      } else {
        const corretorForResolve =
          dto.corretorId !== undefined
            ? dto.corretorId
            : existing.corretorId;
        const resolved = corretorForResolve
          ? await this.resolveGerenteOfCorretor(corretorForResolve, tenantId)
          : null;
        data.gerente = resolved
          ? { connect: { id: resolved } }
          : { disconnect: true };
      }
    } else if (dto.corretorId) {
      const resolved = await this.resolveGerenteOfCorretor(
        dto.corretorId,
        tenantId,
      );
      if (resolved) {
        data.gerente = { connect: { id: resolved } };
      }
    }
    if (dto.dataAnalise !== undefined) {
      data.dataAnalise = parseOptionalDate(dto.dataAnalise) ?? null;
    } else if (
      dto.status1 !== undefined &&
      isStatusAnalise(dto.status1) &&
      !existing.dataAnalise
    ) {
      data.dataAnalise = todayDateOnly();
    }
    if (dto.dataVenda !== undefined) {
      data.dataVenda = parseOptionalDate(dto.dataVenda) ?? null;
    }
    if (dto.vgv !== undefined) data.vgv = dto.vgv;
    if (dto.obs !== undefined) data.obs = dto.obs?.trim() || null;

    return this.prisma.documentacao.update({
      where: { id },
      data,
      select: docSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: { id: true, leadId: true, autorId: true },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.ensureLeadAccessible(existing.leadId, requester);

    if (
      requester.role === Role.corretor &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Você só pode excluir documentações que criou.',
      );
    }

    await this.prisma.documentacao.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveGerenteOfCorretor(
    corretorId: string,
    tenantId: string,
  ): Promise<string | null> {
    const corretor = await this.prisma.user.findFirst({
      where: { id: corretorId, tenantId },
      select: {
        equipe: { select: { gerenteId: true } },
      },
    });
    return corretor?.equipe?.gerenteId ?? null;
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        nome: true,
        stage: true,
        corretorId: true,
        construtoraId: true,
        empreendimentoId: true,
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
