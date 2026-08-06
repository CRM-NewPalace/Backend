import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FunilEtapaPapel, Prisma, Role, TriagemOrigem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { FunisService } from '../funis/funis.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  canonicalizeStatus1,
  canonicalizeStatus2,
  isStatusAnalise,
  isStatusVendido,
} from '../common/utils/documentacao-status';
import { requireTenantId } from '../common/utils/tenant';
import { CreateDocumentacaoDto } from './dto/create-documentacao.dto';
import { UpdateDocumentacaoDto } from './dto/update-documentacao.dto';
import { QueryDocumentacaoDto } from './dto/query-documentacao.dto';

const userMini = {
  select: { id: true, name: true, cor: true, role: true },
} as const;

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
  temEntrada: true,
  valorEntrada: true,
  temFgts: true,
  valorFgts: true,
  temDependente: true,
  createdAt: true,
  updatedAt: true,
  autor: userMini,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimento: { select: { id: true, nome: true, cidade: true, cor: true } },
  corretor: userMini,
  gerente: userMini,
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      origem: true,
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

function todayDateOnly(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

@Injectable()
export class DocumentacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly funis: FunisService,
  ) {}

  async list(query: QueryDocumentacaoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const visibility = await this.buildVisibilityWhere(requester);

    const andFilters: Prisma.DocumentacaoWhereInput[] = [
      visibility,
      { lead: { perdidoAt: null } },
    ];

    if (query.corretorId && requester.role === Role.admin) {
      andFilters.push({
        OR: [
          { corretorId: query.corretorId },
          { lead: { corretorId: query.corretorId } },
        ],
      });
    }

    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: andFilters,
      },
      select: docSelect,
      orderBy: { createdAt: 'desc' },
    });

    // Alinha funil: leads com documentação vendida avançam para etapa Venda
    const vendidoLeadIds = [
      ...new Set(
        docs.filter((d) => isStatusVendido(d.status2)).map((d) => d.leadId),
      ),
    ];
    if (vendidoLeadIds.length > 0) {
      await this.moveLeadsToVendaStage(
        tenantId,
        vendidoLeadIds,
        requester.id,
      );
    }

    return docs;
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.assertCanView(id, tenantId, requester);
    const doc = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: docSelect,
    });
    if (!doc) {
      throw new NotFoundException('Documentação não encontrada.');
    }
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

    const status1 = canonicalizeStatus1(dto.status1);
    const parsedAnalise = parseOptionalDate(dto.dataAnalise);
    const dataAnalise =
      parsedAnalise ?? (isStatusAnalise(status1) ? todayDateOnly() : null);

    const status2 = canonicalizeStatus2(dto.status2);
    const created = await this.prisma.documentacao.create({
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
        status2,
        corretorId,
        gerenteId,
        dataAnalise,
        dataVenda: parseOptionalDate(dto.dataVenda) ?? null,
        vgv: dto.vgv ?? null,
        obs: dto.obs?.trim() || null,
        temEntrada: dto.temEntrada ?? false,
        valorEntrada: dto.temEntrada ? (dto.valorEntrada ?? null) : null,
        temFgts: dto.temFgts ?? false,
        valorFgts: dto.temFgts ? (dto.valorFgts ?? null) : null,
        temDependente: dto.temDependente ?? false,
      },
      select: docSelect,
    });

    if (isStatusVendido(status2)) {
      await this.moveLeadsToVendaStage(tenantId, [lead.id], requester.id);
    }

    return created;
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
        autorId: true,
        autor: { select: { id: true, role: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.assertCanView(id, tenantId, requester);
    if (
      !this.canMutateDocumentacao(
        requester,
        existing.autor.id,
        existing.autor.role,
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para editar esta documentação.',
      );
    }

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
    if (dto.status1 !== undefined) {
      data.status1 = canonicalizeStatus1(dto.status1);
    }
    if (dto.status2 !== undefined) {
      data.status2 = canonicalizeStatus2(dto.status2);
    }
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
    if (dto.temEntrada !== undefined) {
      data.temEntrada = dto.temEntrada;
      if (!dto.temEntrada) data.valorEntrada = null;
    }
    if (dto.valorEntrada !== undefined && dto.temEntrada !== false) {
      data.valorEntrada = dto.valorEntrada;
    }
    if (dto.temFgts !== undefined) {
      data.temFgts = dto.temFgts;
      if (!dto.temFgts) data.valorFgts = null;
    }
    if (dto.valorFgts !== undefined && dto.temFgts !== false) {
      data.valorFgts = dto.valorFgts;
    }
    if (dto.temDependente !== undefined) data.temDependente = dto.temDependente;

    const updated = await this.prisma.documentacao.update({
      where: { id },
      data,
      select: docSelect,
    });

    if (isStatusVendido(updated.status2)) {
      await this.moveLeadsToVendaStage(
        tenantId,
        [existing.leadId],
        requester.id,
      );
    }

    return updated;
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        autor: { select: { id: true, role: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.assertCanView(id, tenantId, requester);
    if (
      !this.canMutateDocumentacao(
        requester,
        existing.autor.id,
        existing.autor.role,
      )
    ) {
      throw new ForbiddenException(
        'Você só pode excluir documentações que criou.',
      );
    }

    await this.prisma.documentacao.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * - Corretor: só fichas comerciais que criou
   * - Gerente: só fichas de análise da equipe (leitura)
   * - Analista: só fichas de análise (autor analista ou admin)
   * - Admin: fichas de análise + próprias fichas comerciais (carteira/vendas)
   */
  private async buildVisibilityWhere(
    requester: AuthenticatedUser,
  ): Promise<Prisma.DocumentacaoWhereInput> {
    switch (requester.role) {
      case Role.admin:
        return {
          OR: [
            { autor: { role: { in: [Role.analista, Role.admin] } } },
            { autorId: requester.id },
            { corretorId: requester.id },
          ],
        };
      case Role.analista:
        return {
          autor: { role: { in: [Role.analista, Role.admin] } },
        };
      case Role.corretor:
        return { autorId: requester.id };
      case Role.gerente: {
        const teamCorretorIds =
          (await this.teamScope.getVisibleCorretorIds(requester)) ?? [];
        const teamActorIds = [...new Set([...teamCorretorIds, requester.id])];
        return {
          autor: { role: { in: [Role.analista, Role.admin] } },
          OR: [
            { corretorId: { in: teamActorIds } },
            { gerenteId: requester.id },
            { lead: { corretorId: { in: teamActorIds } } },
          ],
        };
      }
      default:
        return { autorId: requester.id };
    }
  }

  private async assertCanView(
    id: string,
    tenantId: string,
    requester: AuthenticatedUser,
  ) {
    const visibility = await this.buildVisibilityWhere(requester);
    const found = await this.prisma.documentacao.findFirst({
      where: { id, tenantId, AND: [visibility] },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Documentação não encontrada.');
    }
  }

  private canMutateDocumentacao(
    requester: AuthenticatedUser,
    autorId: string,
    autorRole: Role,
  ): boolean {
    // Admin: fichas de análise + as que ele próprio criou (vendas/carteira).
    if (requester.role === Role.admin) {
      return (
        autorId === requester.id ||
        autorRole === Role.analista ||
        autorRole === Role.admin
      );
    }
    if (requester.role === Role.analista) {
      return autorId === requester.id || autorRole === Role.admin;
    }
    // Corretor: só as próprias. Gerente só visualiza fichas de análise.
    if (requester.role === Role.corretor) {
      return autorId === requester.id;
    }
    if (requester.role === Role.gerente) {
      return false;
    }
    return false;
  }

  /**
   * Documentação vendida deve aparecer na coluna Venda do funil.
   */
  private async moveLeadsToVendaStage(
    tenantId: string,
    leadIds: string[],
    autorId: string,
  ) {
    const uniqueIds = [...new Set(leadIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const vendaSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    if (!vendaSlug) return;

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        id: { in: uniqueIds },
        perdidoAt: null,
        NOT: { stage: vendaSlug },
      },
      select: { id: true, stage: true },
    });
    if (leads.length === 0) return;

    const leadIdsMoved = leads.map((l) => l.id);

    await this.prisma.$transaction([
      this.prisma.lead.updateMany({
        where: { id: { in: leadIdsMoved } },
        data: { stage: vendaSlug },
      }),
      // Mantém o snapshot da ficha alinhado à etapa atual do funil.
      this.prisma.documentacao.updateMany({
        where: { tenantId, leadId: { in: leadIdsMoved } },
        data: { stageSituacao: vendaSlug },
      }),
      this.prisma.triagemEvent.createMany({
        data: leads.map((lead) => ({
          leadId: lead.id,
          autorId,
          texto:
            'Etapa avançada para venda (documentação marcada como vendido).',
          stageAnterior: lead.stage,
          stageNovo: vendaSlug,
          origem: TriagemOrigem.funil,
        })),
      }),
    ]);
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
