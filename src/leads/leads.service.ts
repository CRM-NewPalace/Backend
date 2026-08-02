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
    lead: { corretorId: string | null },
    requester: AuthenticatedUser,
  ): Promise<void> {
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
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
