import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CatalogItem, CatalogType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { ReorderCatalogDto } from './dto/reorder-catalog.dto';
import { slugify } from './catalog.util';
import {
  DEFAULT_DOCUMENTACAO_FONTES,
  DEFAULT_DOCUMENTACAO_STATUS1,
  DEFAULT_DOCUMENTACAO_STATUS2,
  DEFAULT_INITIAL_STAGE_SLUG,
  DEFAULT_MOTIVOS_PERDA,
} from './catalog.defaults';
import { FunisService } from '../funis/funis.service';

export type GroupedCatalog = Record<CatalogType, CatalogItem[]>;

const DOCUMENTACAO_CATALOG_TYPES = new Set<CatalogType>([
  CatalogType.documentacao_fonte,
  CatalogType.documentacao_status1,
  CatalogType.documentacao_status2,
]);

const DOCUMENTACAO_CATALOG_DEFAULTS: Record<
  | typeof CatalogType.documentacao_fonte
  | typeof CatalogType.documentacao_status1
  | typeof CatalogType.documentacao_status2,
  readonly { label: string; color: string }[]
> = {
  [CatalogType.documentacao_fonte]: DEFAULT_DOCUMENTACAO_FONTES,
  [CatalogType.documentacao_status1]: DEFAULT_DOCUMENTACAO_STATUS1,
  [CatalogType.documentacao_status2]: DEFAULT_DOCUMENTACAO_STATUS2,
};

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
    await this.ensureDocumentacaoCatalogDefaults(tenantId);
    await this.ensureMotivoPerdaDefaults(tenantId);

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
      [CatalogType.documentacao_fonte]: [],
      [CatalogType.documentacao_status1]: [],
      [CatalogType.documentacao_status2]: [],
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

  /** Garante fontes/status padrão da documentação no tenant. */
  private async ensureDocumentacaoCatalogDefaults(tenantId: string) {
    for (const [type, defaults] of Object.entries(
      DOCUMENTACAO_CATALOG_DEFAULTS,
    ) as Array<
      [
        keyof typeof DOCUMENTACAO_CATALOG_DEFAULTS,
        readonly { label: string; color: string }[],
      ]
    >) {
      const count = await this.prisma.catalogItem.count({
        where: { tenantId, type },
      });
      if (count > 0) continue;
      for (const [index, item] of defaults.entries()) {
        await this.prisma.catalogItem.create({
          data: {
            tenantId,
            type,
            label: item.label,
            slug: slugify(item.label),
            color: item.color,
            sortOrder: index,
            active: true,
          },
        });
      }
    }
  }

  /** Garante motivos padrão de perda no tenant. */
  private async ensureMotivoPerdaDefaults(tenantId: string) {
    const count = await this.prisma.catalogItem.count({
      where: { tenantId, type: CatalogType.motivo_perda },
    });
    if (count > 0) return;
    for (const [index, item] of DEFAULT_MOTIVOS_PERDA.entries()) {
      await this.prisma.catalogItem.create({
        data: {
          tenantId,
          type: CatalogType.motivo_perda,
          label: item.label,
          slug: slugify(item.label),
          color: item.color,
          sortOrder: index,
          active: true,
        },
      });
    }
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
    this.assertCanMutateCatalogType(requester, dto.type);
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
    this.assertCanMutateCatalogType(requester, existing.type);

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

  private assertCanMutateCatalogType(
    requester: AuthenticatedUser,
    type: CatalogType,
  ) {
    if (requester.role === Role.admin || requester.role === Role.gerente) {
      return;
    }
    if (
      requester.role === Role.analista &&
      DOCUMENTACAO_CATALOG_TYPES.has(type)
    ) {
      return;
    }
    if (
      requester.role === Role.corretor &&
      type === CatalogType.motivo_perda
    ) {
      return;
    }
    if (requester.role === Role.analista) {
      throw new ForbiddenException(
        'Analistas só podem criar fontes e status da documentação.',
      );
    }
    if (requester.role === Role.corretor) {
      throw new ForbiddenException(
        'Corretores só podem criar ou editar motivos de perda.',
      );
    }
    throw new ForbiddenException('Sem permissão para alterar este catálogo.');
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
