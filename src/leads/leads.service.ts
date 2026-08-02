import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, CatalogType, Prisma, Role, TriagemOrigem, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CatalogService } from '../catalog/catalog.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AnaliseService } from '../analise/analise.service';
import { leadSelect, LeadEntity } from './lead-select';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import {
  DistribuirCorretoresDto,
  DistribuirEquipesDto,
} from './dto/distribuir-leads.dto';

export interface PaginatedLeads {
  data: LeadEntity[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly teamScope: TeamScopeService,
    private readonly analiseService: AnaliseService,
  ) {}

  async create(
    dto: CreateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);

    if (requester.role === Role.analista) {
      throw new ForbiddenException(
        'Analistas não podem criar leads ou clientes.',
      );
    }

    // Corretor só cria leads para si; admin/gerente atribuem dentro do escopo.
    const corretorId = this.isCorretor(requester)
      ? requester.id
      : (dto.corretorId ?? requester.id);

    await this.ensureCorretorAssignable(corretorId, requester);

    const stage = dto.stage ?? (await this.catalog.getDefaultStageSlug(tenantId));
    await this.ensureStageIsValid(tenantId, stage);

    return this.prisma.lead.create({
      data: {
        tenantId,
        tipo: dto.tipo === 'cliente' ? ContatoTipo.cliente : ContatoTipo.lead,
        nome: dto.nome.trim(),
        telefone: dto.telefone.trim(),
        email: dto.email.toLowerCase().trim(),
        origem: dto.origem.trim(),
        interesse: dto.interesse,
        cidade: dto.cidade.trim(),
        bairro: dto.bairro.trim(),
        stage,
        prioridade: dto.prioridade ?? 'Média',
        renda: dto.renda ?? null,
        tags: dto.tags ?? [],
        corretorId,
      },
      select: leadSelect,
    });
  }

  async importMany(dto: ImportLeadsDto, requester: AuthenticatedUser) {
    if (requester.role === Role.analista) {
      throw new ForbiddenException('Analistas não podem importar leads.');
    }

    const tenantId = requireTenantId(requester);
    const defaultStage = await this.catalog.getDefaultStageSlug(tenantId);
    await this.ensureStageIsValid(tenantId, defaultStage);

    const created: LeadEntity[] = [];
    const errors: Array<{ index: number; nome: string; message: string }> = [];

    for (let index = 0; index < dto.leads.length; index++) {
      const item = dto.leads[index];
      try {
        /** Importação começa sem dono; só atribui se vier corretorId explícito. */
        let corretorId: string | null = null;
        if (item.corretorId) {
          await this.ensureCorretorAssignable(item.corretorId, requester);
          corretorId = item.corretorId;
        } else if (this.isCorretor(requester)) {
          corretorId = requester.id;
        }

        const digits = item.telefone.replace(/\D/g, '');
        const email =
          item.email?.trim().toLowerCase() ||
          `import.${digits || index}@sem-email.local`;

        const lead = await this.prisma.lead.create({
          data: {
            tenantId,
            tipo: ContatoTipo.lead,
            nome: item.nome.trim(),
            telefone: item.telefone.trim(),
            email,
            origem: (item.origem?.trim() || 'Importação').slice(0, 60),
            interesse: item.interesse ?? 'Comprar',
            cidade: (item.cidade?.trim() || 'Não informado').slice(0, 80),
            bairro: (item.bairro?.trim() || 'Não informado').slice(0, 80),
            stage: defaultStage,
            prioridade: item.prioridade ?? 'Média',
            renda: item.renda ?? null,
            tags: ['Importação'],
            corretorId,
          },
          select: leadSelect,
        });
        created.push(lead);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha ao importar este lead.';
        errors.push({
          index,
          nome: item.nome,
          message,
        });
      }
    }

    return {
      ok: true,
      total: dto.leads.length,
      created: created.length,
      failed: errors.length,
      leads: created,
      errors,
    };
  }

  /** Resumo para o diálogo de distribuição. */
  async distribuirResumo(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (requester.role === Role.admin) {
      const disponiveis = await this.prisma.lead.count({
        where: {
          tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          corretorId: null,
          equipeId: null,
        },
      });
      const equipes = await this.prisma.equipe.findMany({
        where: { tenantId, status: UserStatus.ativo },
        select: {
          id: true,
          name: true,
          gerente: { select: { id: true, name: true } },
          membros: {
            where: { role: Role.corretor, status: UserStatus.ativo },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      return {
        modo: 'equipes' as const,
        disponiveis,
        equipes: equipes.map((e) => ({
          equipeId: e.id,
          nome: e.name,
          gerente: e.gerente.name,
          corretores: e.membros.length,
        })),
      };
    }

    if (requester.role === Role.gerente) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { gerenteId: requester.id, tenantId, status: UserStatus.ativo },
        select: {
          id: true,
          name: true,
          membros: {
            where: { role: Role.corretor, status: UserStatus.ativo },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          },
        },
      });
      if (!equipe) {
        throw new ForbiddenException('Você não lidera uma equipe ativa.');
      }
      const disponiveis = await this.prisma.lead.count({
        where: {
          tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          equipeId: equipe.id,
          corretorId: null,
        },
      });
      return {
        modo: 'corretores' as const,
        disponiveis,
        equipeId: equipe.id,
        equipeNome: equipe.name,
        corretores: equipe.membros.map((m) => ({
          id: m.id,
          nome: m.name,
        })),
      };
    }

    throw new ForbiddenException(
      'Somente admin e gerente podem distribuir leads.',
    );
  }

  /** Admin: aloca leads sem dono para o pool das equipes. */
  async distribuirEquipes(
    dto: DistribuirEquipesDto,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException('Somente admin distribui entre equipes.');
    }
    const tenantId = requireTenantId(requester);
    const totalPedido = dto.alocacoes.reduce((s, a) => s + a.quantidade, 0);
    if (totalPedido <= 0) {
      throw new BadRequestException('Informe ao menos 1 lead para distribuir.');
    }

    const equipeIds = dto.alocacoes.map((a) => a.equipeId);
    const equipes = await this.prisma.equipe.findMany({
      where: {
        tenantId,
        status: UserStatus.ativo,
        id: { in: equipeIds },
      },
      select: { id: true, name: true },
    });
    if (equipes.length !== new Set(equipeIds).size) {
      throw new BadRequestException('Uma ou mais equipes são inválidas.');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        corretorId: null,
        equipeId: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: totalPedido,
    });

    if (leads.length < totalPedido) {
      throw new BadRequestException(
        `Há apenas ${leads.length} lead(s) disponíveis para distribuir (pedido: ${totalPedido}).`,
      );
    }

    let offset = 0;
    const resultado: Array<{
      equipeId: string;
      nome: string;
      quantidade: number;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const aloc of dto.alocacoes) {
        if (aloc.quantidade <= 0) continue;
        const slice = leads.slice(offset, offset + aloc.quantidade);
        offset += aloc.quantidade;
        await tx.lead.updateMany({
          where: { id: { in: slice.map((l) => l.id) } },
          data: { equipeId: aloc.equipeId },
        });
        const eq = equipes.find((e) => e.id === aloc.equipeId)!;
        resultado.push({
          equipeId: eq.id,
          nome: eq.name,
          quantidade: slice.length,
        });
      }
    });

    return { ok: true, total: totalPedido, alocacoes: resultado };
  }

  /**
   * Gerente: fila round-robin — cada corretor recebe `porCorretor` leads
   * por rodada, até acabar o pool da equipe.
   */
  async distribuirCorretores(
    dto: DistribuirCorretoresDto,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Somente o gerente distribui leads aos corretores da equipe.',
      );
    }
    const tenantId = requireTenantId(requester);
    const equipe = await this.prisma.equipe.findFirst({
      where: { gerenteId: requester.id, tenantId, status: UserStatus.ativo },
      select: {
        id: true,
        membros: {
          where: { role: Role.corretor, status: UserStatus.ativo },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!equipe || equipe.membros.length === 0) {
      throw new BadRequestException(
        'Sua equipe não tem corretores ativos para receber leads.',
      );
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        equipeId: equipe.id,
        corretorId: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (leads.length === 0) {
      throw new BadRequestException(
        'Não há leads no pool da sua equipe para distribuir.',
      );
    }

    const porCorretor = dto.porCorretor;
    const corretores = equipe.membros;
    const counts = new Map(corretores.map((c) => [c.id, 0]));
    const assignments: Array<{ leadId: string; corretorId: string }> = [];

    let leadIdx = 0;
    let corretorIdx = 0;
    while (leadIdx < leads.length) {
      const corretor = corretores[corretorIdx % corretores.length]!;
      const take = Math.min(porCorretor, leads.length - leadIdx);
      for (let i = 0; i < take; i++) {
        const lead = leads[leadIdx++]!;
        assignments.push({ leadId: lead.id, corretorId: corretor.id });
        counts.set(corretor.id, (counts.get(corretor.id) ?? 0) + 1);
      }
      corretorIdx += 1;
    }

    await this.prisma.$transaction(
      assignments.map((a) =>
        this.prisma.lead.update({
          where: { id: a.leadId },
          data: { corretorId: a.corretorId },
        }),
      ),
    );

    return {
      ok: true,
      total: assignments.length,
      porCorretor,
      distribuicao: corretores.map((c) => ({
        corretorId: c.id,
        nome: c.name,
        quantidade: counts.get(c.id) ?? 0,
      })),
    };
  }

  async findAll(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '') ?? '';

    let phoneMatchIds: string[] = [];
    if (searchDigits.length >= 3) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM leads
        WHERE regexp_replace(telefone, '[^0-9]', '', 'g')
          LIKE ${`%${searchDigits}%`}
      `;
      phoneMatchIds = rows.map((r) => r.id);
    }

    const leadScope = await this.teamScope.leadScope(requester);

    const where: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(query.tipo ? { tipo: query.tipo as ContatoTipo } : {}),
      ...leadScope,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      ...(query.origem ? { origem: query.origem } : {}),
      ...(search
        ? {
            OR: [
              { nome: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
              { bairro: { contains: search, mode: 'insensitive' } },
              { cidade: { contains: search, mode: 'insensitive' } },
              ...(phoneMatchIds.length > 0
                ? [{ id: { in: phoneMatchIds } }]
                : []),
            ],
          }
        : {}),
    };

    if (query.corretorId && !this.isCorretor(requester)) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) {
        return {
          data: [],
          meta: { total: 0, page, limit, totalPages: 1 },
        };
      }
      where.corretorId = query.corretorId;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }

    // Leads perdidos só o admin consulta (módulo dedicado).
    if (lead.perdidoAt) {
      if (requester.role !== Role.admin) {
        throw new NotFoundException('Lead não encontrado.');
      }
      return lead;
    }

    await this.ensureCanAccess(lead, requester);
    return lead;
  }

  /**
   * Lista leads marcados como perdidos — exclusivo do admin.
   */
  async findLost(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const tenantId = requireTenantId(requester);
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem ver leads perdidos.',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
      tenantId,
      perdidoAt: { not: null },
      ...(query.origem ? { origem: query.origem } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(query.corretorId ? { corretorId: query.corretorId } : {}),
      ...(search
        ? {
            OR: [
              { nome: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
              { motivoPerda: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: { perdidoAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);

    // Corretor não pode reatribuir o lead para outra pessoa.
    let corretorId: string | undefined;
    if (dto.corretorId !== undefined) {
      if (this.isCorretor(requester)) {
        throw new ForbiddenException(
          'Você não pode reatribuir o lead para outro corretor.',
        );
      }
      await this.ensureCorretorAssignable(dto.corretorId, requester);
      corretorId = dto.corretorId;
    }

    if (dto.stage !== undefined) {
      await this.ensureStageIsValid(tenantId, dto.stage);
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.toLowerCase().trim() }
          : {}),
        ...(dto.origem !== undefined ? { origem: dto.origem.trim() } : {}),
        ...(dto.interesse !== undefined ? { interesse: dto.interesse } : {}),
        ...(dto.cidade !== undefined ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.bairro !== undefined ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.prioridade !== undefined ? { prioridade: dto.prioridade } : {}),
        ...(dto.renda !== undefined ? { renda: dto.renda } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(corretorId !== undefined ? { corretorId } : {}),
      },
      select: leadSelect,
    });
  }

  async updateStage(
    id: string,
    dto: { stage: string; construtoraId?: string; empreendimentoId?: string },
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);
    const stage = dto.stage;
    await this.ensureStageIsValid(tenantId, stage);

    const previous = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        stage: true,
        construtoraId: true,
        empreendimentoId: true,
      },
    });
    const stageAnterior = previous?.stage ?? null;

    if (requester.role === Role.analista) {
      // Analista não move o funil comercial; opera pela fila de Análise.
      throw new ForbiddenException(
        'Analistas operam pela fila de Análise (Assumir / parecer).',
      );
    }

    let construtoraId = previous?.construtoraId ?? null;
    let empreendimentoId = previous?.empreendimentoId ?? null;

    if (stage === 'em-analise') {
      construtoraId = dto.construtoraId ?? construtoraId;
      empreendimentoId = dto.empreendimentoId ?? empreendimentoId;
      if (!construtoraId || !empreendimentoId) {
        throw new BadRequestException(
          'Informe a construtora e o empreendimento ao enviar para análise.',
        );
      }
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        stage,
        ...(stage === 'em-analise'
          ? { construtoraId, empreendimentoId }
          : {}),
      },
      select: leadSelect,
    });

    // Sempre registra na Triagem a mudança de etapa (mesmo sem relato manual).
    if (stageAnterior && stageAnterior !== stage) {
      const [fromLabel, toLabel] = await Promise.all([
        this.resolveStageLabel(tenantId, stageAnterior),
        this.resolveStageLabel(tenantId, stage),
      ]);
      await this.prisma.triagemEvent.create({
        data: {
          leadId: id,
          autorId: requester.id,
          texto: `Etapa avançada de "${fromLabel}" para "${toLabel}".`,
          stageAnterior,
          stageNovo: stage,
          origem: TriagemOrigem.funil,
        },
      });
    }

    if (stage === 'em-analise') {
      await this.analiseService.ensureForLead(id, requester.id, tenantId);
    }

    return lead;
  }

  /** Label amigável da etapa do funil (fallback para o slug). */
  private async resolveStageLabel(
    tenantId: string,
    slug: string,
  ): Promise<string> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.funil_etapa, slug },
      select: { label: true },
    });
    return item?.label ?? slug;
  }

  /**
   * Marca o lead como perdido (sai das listas de corretor/gerente).
   * O registro permanece no banco para o módulo Leads Perdidos (admin).
   */
  async markLost(
    id: string,
    motivo: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);

    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      throw new BadRequestException('Informe o motivo da exclusão.');
    }

    // Move para a etapa "perdido" do funil quando existir.
    const stageSlugs = await this.catalog.getActiveStageSlugs(tenantId);
    const perdidoStage = stageSlugs.includes('perdido') ? 'perdido' : undefined;

    return this.prisma.lead.update({
      where: { id },
      data: {
        perdidoAt: new Date(),
        motivoPerda: motivoTrim,
        perdidoPorId: requester.id,
        ...(perdidoStage ? { stage: perdidoStage } : {}),
      },
      select: leadSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const tenantId = requireTenantId(requester);
    // Hard delete só para admin, e apenas de leads já perdidos.
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Para remover um lead da operação, informe o motivo — ele irá para Leads Perdidos.',
      );
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, perdidoAt: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }
    if (!lead.perdidoAt) {
      throw new BadRequestException(
        'Marque o lead como perdido antes de excluí-lo definitivamente.',
      );
    }
    await this.prisma.lead.delete({ where: { id } });
  }

  /**
   * Lista corretores ativos para o select de atribuição.
   * Admin: todos. Gerente: só da própria equipe. Corretor: apenas o próprio.
   */
  async listAssignees(
    requester: AuthenticatedUser,
  ): Promise<{ id: string; name: string; role: Role }[]> {
    const tenantId = requireTenantId(requester);
    if (this.isCorretor(requester)) {
      return [
        {
          id: requester.id,
          name: requester.name,
          role: requester.role,
        },
      ];
    }

    const ids = await this.teamScope.getVisibleCorretorIds(requester);
    return this.prisma.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ativo,
        role: Role.corretor,
        ...(ids !== null ? { id: { in: ids } } : {}),
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  // --- Helpers de RBAC ---

  private isCorretor(requester: AuthenticatedUser): boolean {
    return requester.role === Role.corretor;
  }

  private async ensureCanAccess(
    lead: { corretorId: string | null; equipeId?: string | null },
    requester: AuthenticatedUser,
  ): Promise<void> {
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async ensureExistsAndAccessible(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, corretorId: true, perdidoAt: true },
    });
    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }
    await this.ensureCanAccess(lead, requester);
  }

  private async ensureCorretorAssignable(
    corretorId: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = requireTenantId(requester);
    const count = await this.prisma.user.count({
      where: {
        id: corretorId,
        tenantId,
        status: UserStatus.ativo,
        role: Role.corretor,
      },
    });
    if (count === 0) {
      throw new BadRequestException(
        'Corretor informado não existe ou está inativo.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      corretorId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você só pode atribuir leads a corretores da sua equipe.',
      );
    }
  }

  /** Garante que a etapa exista entre as etapas ativas do catálogo do funil. */
  private async ensureStageIsValid(
    tenantId: string,
    stage: string,
  ): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs(tenantId);
    if (validStages.length === 0) {
      throw new BadRequestException(
        'Nenhuma etapa do funil cadastrada. Configure as etapas em Configurações antes de criar ou mover leads.',
      );
    }
    if (!validStages.includes(stage)) {
      throw new BadRequestException('Etapa do funil inválida.');
    }
  }
}
