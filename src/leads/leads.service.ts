import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CatalogService } from '../catalog/catalog.service';
import { leadSelect, LeadEntity } from './lead-select';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';

export interface PaginatedLeads {
  data: LeadEntity[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async create(
    dto: CreateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    // Corretor só cria leads para si; admin/gerente podem atribuir a qualquer um.
    const corretorId = this.isCorretor(requester)
      ? requester.id
      : (dto.corretorId ?? requester.id);

    await this.ensureCorretorExists(corretorId);

    const stage = dto.stage ?? (await this.catalog.getDefaultStageSlug());
    await this.ensureStageIsValid(stage);

    return this.prisma.lead.create({
      data: {
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

    const where: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(query.tipo ? { tipo: query.tipo as ContatoTipo } : {}),
      ...this.scopeByRole(requester),
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      ...(query.origem ? { origem: query.origem } : {}),
      // O filtro por corretor só vale para admin/gerente; o corretor já está
      // restrito aos próprios leads por scopeByRole.
      ...(query.corretorId && !this.isCorretor(requester)
        ? { corretorId: query.corretorId }
        : {}),
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
    const lead = await this.prisma.lead.findUnique({
      where: { id },
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

    this.ensureCanAccess(lead, requester);
    return lead;
  }

  /**
   * Lista leads marcados como perdidos — exclusivo do admin.
   */
  async findLost(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem ver leads perdidos.',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
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
    await this.ensureExistsAndAccessible(id, requester);

    // Corretor não pode reatribuir o lead para outra pessoa.
    let corretorId: string | undefined;
    if (dto.corretorId !== undefined) {
      if (this.isCorretor(requester)) {
        throw new ForbiddenException(
          'Você não pode reatribuir o lead para outro corretor.',
        );
      }
      await this.ensureCorretorExists(dto.corretorId);
      corretorId = dto.corretorId;
    }

    if (dto.stage !== undefined) {
      await this.ensureStageIsValid(dto.stage);
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
    stage: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    await this.ensureExistsAndAccessible(id, requester);
    await this.ensureStageIsValid(stage);
    return this.prisma.lead.update({
      where: { id },
      data: { stage },
      select: leadSelect,
    });
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
    await this.ensureExistsAndAccessible(id, requester);

    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      throw new BadRequestException('Informe o motivo da exclusão.');
    }

    // Move para a etapa "perdido" do funil quando existir.
    const stageSlugs = await this.catalog.getActiveStageSlugs();
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
    // Hard delete só para admin, e apenas de leads já perdidos.
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Para remover um lead da operação, informe o motivo — ele irá para Leads Perdidos.',
      );
    }
    const lead = await this.prisma.lead.findUnique({
      where: { id },
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
   * Admin/gerente: todos os corretores ativos. Corretor: apenas o próprio.
   */
  async listAssignees(
    requester: AuthenticatedUser,
  ): Promise<{ id: string; name: string; role: Role }[]> {
    if (this.isCorretor(requester)) {
      return [
        {
          id: requester.id,
          name: requester.name,
          role: requester.role,
        },
      ];
    }

    return this.prisma.user.findMany({
      where: { status: UserStatus.ativo, role: Role.corretor },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  // --- Helpers de RBAC ---

  private isCorretor(requester: AuthenticatedUser): boolean {
    return requester.role === Role.corretor;
  }

  /** Restringe a consulta aos leads do próprio corretor. Admin/gerente veem tudo. */
  private scopeByRole(requester: AuthenticatedUser): Prisma.LeadWhereInput {
    return this.isCorretor(requester) ? { corretorId: requester.id } : {};
  }

  private ensureCanAccess(
    lead: LeadEntity,
    requester: AuthenticatedUser,
  ): void {
    if (this.isCorretor(requester) && lead.corretorId !== requester.id) {
      // Mesma resposta de "não existe" para não revelar leads de terceiros.
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async ensureExistsAndAccessible(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, corretorId: true, perdidoAt: true },
    });
    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }
    if (this.isCorretor(requester) && lead.corretorId !== requester.id) {
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async ensureCorretorExists(corretorId: string): Promise<void> {
    const count = await this.prisma.user.count({
      where: {
        id: corretorId,
        status: UserStatus.ativo,
        role: Role.corretor,
      },
    });
    if (count === 0) {
      throw new BadRequestException('Corretor informado não existe ou está inativo.');
    }
  }

  /** Garante que a etapa exista entre as etapas ativas do catálogo do funil. */
  private async ensureStageIsValid(stage: string): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs();
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
