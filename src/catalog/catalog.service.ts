import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import {
  DEFAULT_FUNNEL_STAGES,
  DEFAULT_INITIAL_STAGE_SLUG,
} from './catalog.defaults';

export type GroupedCatalog = Record<CatalogType, CatalogItem[]>;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista itens de um tipo específico, ordenados. */
  async findByType(
    requester: AuthenticatedUser,
    type: CatalogType,
    activeOnly = true,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);
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
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    const grouped = {
      [CatalogType.funil_etapa]: [],
      [CatalogType.origem]: [],
      [CatalogType.motivo_perda]: [],
      [CatalogType.tag]: [],
    } as GroupedCatalog;

    for (const item of items) {
      grouped[item.type].push(item);
    }
    return grouped;
  }

  async create(
    dto: CreateCatalogItemDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
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
   * Instala/restaura o pacote padrão de etapas do funil no banco.
   * Não apaga etapas customizadas; reativa e atualiza as padrão pelo slug.
   */
  async installDefaultFunnelStages(
    requester: AuthenticatedUser,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);

    for (const stage of DEFAULT_FUNNEL_STAGES) {
      const existing = await this.prisma.catalogItem.findFirst({
        where: { tenantId, type: CatalogType.funil_etapa, slug: stage.slug },
      });

      if (existing) {
        await this.prisma.catalogItem.update({
          where: { id: existing.id },
          data: {
            label: stage.label,
            color: stage.color,
            sortOrder: stage.sortOrder,
            active: true,
          },
        });
        continue;
      }

      // Conflito de label com outro slug: ajusta o label antigo para liberar o unique.
      const labelClash = await this.prisma.catalogItem.findUnique({
        where: {
          tenantId_type_label: {
            tenantId,
            type: CatalogType.funil_etapa,
            label: stage.label,
          },
        },
      });
      if (labelClash) {
        await this.prisma.catalogItem.update({
          where: { id: labelClash.id },
          data: {
            label: stage.label,
            slug: stage.slug,
            color: stage.color,
            sortOrder: stage.sortOrder,
            active: true,
          },
        });
        continue;
      }

      await this.prisma.catalogItem.create({
        data: {
          tenantId,
          type: CatalogType.funil_etapa,
          label: stage.label,
          slug: stage.slug,
          color: stage.color,
          sortOrder: stage.sortOrder,
          active: true,
        },
      });
    }

    return this.findByType(requester, CatalogType.funil_etapa, true);
  }

  /** Slugs de etapas de funil ativas — usado para validar o stage do lead. */
  async getActiveStageSlugs(tenantId: string): Promise<string[]> {
    const stages = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: CatalogType.funil_etapa, active: true },
      select: { slug: true },
    });
    return stages
      .map((s) => s.slug)
      .filter((slug): slug is string => Boolean(slug));
  }

  /**
   * Etapa inicial para novos leads: slug `novo` se ativo; senão a primeira do funil.
   */
  async getDefaultStageSlug(tenantId: string): Promise<string> {
    const initial = await this.prisma.catalogItem.findFirst({
      where: {
        tenantId,
        type: CatalogType.funil_etapa,
        active: true,
        slug: DEFAULT_INITIAL_STAGE_SLUG,
      },
      select: { slug: true },
    });
    if (initial?.slug) return initial.slug;

    const first = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.funil_etapa, active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { slug: true },
    });
    if (!first?.slug) {
      throw new BadRequestException(
        'Nenhuma etapa do funil cadastrada. Use "Etapas padrão" em Configurações ou cadastre ao menos uma etapa.',
      );
    }
    return first.slug;
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
