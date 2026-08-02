import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CatalogItem, CatalogType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { ReorderCatalogDto } from './dto/reorder-catalog.dto';
import { slugify } from './catalog.util';
import { DEFAULT_INITIAL_STAGE_SLUG } from './catalog.defaults';
import { FunisService } from '../funis/funis.service';

export type GroupedCatalog = Record<CatalogType, CatalogItem[]>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FunisService))
    private readonly funisService: FunisService,
  ) {}

  /** Lista itens de um tipo específico, ordenados. */
  async findByType(
    requester: AuthenticatedUser,
    type: CatalogType,
    activeOnly = true,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);
    if (type === CatalogType.funil_etapa) {
      const stages =
        await this.funisService.listActiveAsCatalogItems(tenantId);
      return activeOnly ? stages.filter((s) => s.active) : stages;
    }
    return this.prisma.catalogItem.findMany({
      where: { tenantId, type, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  /** Lista todos os tipos, agrupados. */
  async findAllGrouped(
    requester: AuthenticatedUser,
    activeOnly = true,
  ): Promise<GroupedCatalog> {
    const tenantId = requireTenantId(requester);
    const items = await this.prisma.catalogItem.findMany({
      where: {
        tenantId,
        type: { not: CatalogType.funil_etapa },
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    const grouped = {
      [CatalogType.funil_etapa]:
        await this.funisService.listActiveAsCatalogItems(tenantId),
      [CatalogType.origem]: [],
      [CatalogType.motivo_perda]: [],
      [CatalogType.tag]: [],
    } as GroupedCatalog;

    if (activeOnly) {
      grouped[CatalogType.funil_etapa] = grouped[
        CatalogType.funil_etapa
      ].filter((s) => s.active);
    }

    for (const item of items) {
      grouped[item.type].push(item);
    }
    return grouped;
  }

  async create(
    dto: CreateCatalogItemDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    if (dto.type === CatalogType.funil_etapa) {
      throw new BadRequestException(
        'Etapas do funil são gerenciadas em Configurações → Funis.',
      );
    }
    const tenantId = requireTenantId(requester);
    const label = dto.label.trim();
    await this.ensureLabelIsAvailable(tenantId, dto.type, label);

    const last = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: dto.type },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    return this.prisma.catalogItem.create({
      data: {
        tenantId,
        type: dto.type,
        label,
        slug: slugify(label),
        // Cor das badges (classes Tailwind) — válido para etapas, origens, tags e motivos.
        color: dto.color?.trim() || null,
        sortOrder,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCatalogItemDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    const tenantId = requireTenantId(requester);
    const existing = await this.ensureExists(id, tenantId);

    const label = dto.label?.trim();
    if (label && label !== existing.label) {
      await this.ensureLabelIsAvailable(tenantId, existing.type, label, id);
    }

    // Slug não muda no rename: é o ID estável usado em Lead.stage e no histórico.
    return this.prisma.catalogItem.update({
      where: { id },
      data: {
        ...(label ? { label } : {}),
        ...(dto.color !== undefined
          ? { color: dto.color?.trim() || null }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  /** Soft-delete: mantém o item mas o remove das listas ativas. */
  async remove(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    const tenantId = requireTenantId(requester);
    const existing = await this.ensureExists(id, tenantId);
    if (
      existing.type === CatalogType.funil_etapa &&
      existing.slug === DEFAULT_INITIAL_STAGE_SLUG
    ) {
      throw new BadRequestException(
        'A etapa "Novo lead" não pode ser removida — é o status inicial dos leads.',
      );
    }
    return this.prisma.catalogItem.update({
      where: { id },
      data: { active: false },
    });
  }

  async reorder(
    dto: ReorderCatalogDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);
    const items = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: dto.type },
      select: { id: true },
    });
    const validIds = new Set(items.map((i) => i.id));

    for (const id of dto.orderedIds) {
      if (!validIds.has(id)) {
        throw new BadRequestException(
          'A lista de ordenação contém itens inválidos para este tipo.',
        );
      }
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.catalogItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findByType(requester, dto.type, false);
  }

  /**
   * Instala/restaura o pacote padrão de etapas no funil ativo.
   */
  async installDefaultFunnelStages(
    requester: AuthenticatedUser,
  ): Promise<CatalogItem[]> {
    const ativo = await this.funisService.getAtivo(requester);
    await this.funisService.installDefaults(ativo.id, requester);
    return this.findByType(requester, CatalogType.funil_etapa, true);
  }

  /** Slugs de etapas de funil ativas — usado para validar o stage do lead. */
  async getActiveStageSlugs(tenantId: string): Promise<string[]> {
    return this.funisService.getActiveStageSlugs(tenantId);
  }

  /**
   * Etapa inicial para novos leads: slug `novo` se ativo; senão a primeira do funil.
   */
  async getDefaultStageSlug(tenantId: string): Promise<string> {
    return this.funisService.getDefaultStageSlug(tenantId);
  }

  private async ensureExists(
    id: string,
    tenantId: string,
  ): Promise<CatalogItem> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Item de catálogo não encontrado.');
    }
    return item;
  }

  private async ensureLabelIsAvailable(
    tenantId: string,
    type: CatalogType,
    label: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.catalogItem.findUnique({
      where: { tenantId_type_label: { tenantId, type, label } },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um item com esse nome.');
    }
  }
}
