import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_FUNNEL_STAGES,
  DEFAULT_INITIAL_STAGE_SLUG,
} from '../catalog/catalog.defaults';
import { slugify } from '../catalog/catalog.util';
import {
  CreateFunilDto,
  CreateFunilEtapaDto,
  ReorderFunilEtapasDto,
  UpdateFunilDto,
  UpdateFunilEtapaDto,
} from './dto/funil.dto';

const etapaSelect = {
  id: true,
  funilId: true,
  label: true,
  slug: true,
  color: true,
  sortOrder: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FunilEtapaSelect;

const funilSelect = {
  id: true,
  tenantId: true,
  name: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  etapas: {
    orderBy: [{ sortOrder: 'asc' as const }, { label: 'asc' as const }],
    select: etapaSelect,
  },
} satisfies Prisma.FunilSelect;

@Injectable()
export class FunisService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureTenantHasFunil(tenantId);
    return this.prisma.funil.findMany({
      where: { tenantId },
      select: funilSelect,
      orderBy: [{ ativo: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const funil = await this.prisma.funil.findFirst({
      where: { id, tenantId },
      select: funilSelect,
    });
    if (!funil) throw new NotFoundException('Funil não encontrado.');
    return funil;
  }

  /** Funil ativo do tenant (cria padrão se ainda não existir). */
  async getAtivo(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.ensureTenantHasFunil(tenantId);
  }

  async create(dto: CreateFunilDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Informe o nome do funil.');

    const clash = await this.prisma.funil.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    if (clash) {
      throw new ConflictException('Já existe um funil com este nome.');
    }

    const etapasInput =
      dto.etapas && dto.etapas.length > 0
        ? dto.etapas
        : dto.usarPadrao === false
          ? [{ label: 'Novo lead', color: DEFAULT_FUNNEL_STAGES[0]!.color }]
          : DEFAULT_FUNNEL_STAGES.map((s) => ({
              label: s.label,
              color: s.color,
              sortOrder: s.sortOrder,
            }));

    const etapasData = this.buildEtapasCreate(etapasInput);

    const ativar = dto.ativar === true;
    const funil = await this.prisma.$transaction(async (tx) => {
      if (ativar) {
        await tx.funil.updateMany({
          where: { tenantId, ativo: true },
          data: { ativo: false },
        });
      }
      const count = await tx.funil.count({ where: { tenantId } });
      return tx.funil.create({
        data: {
          tenantId,
          name,
          ativo: ativar || count === 0,
          etapas: { create: etapasData },
        },
        select: funilSelect,
      });
    });

    return funil;
  }

  async update(id: string, dto: UpdateFunilDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(id, tenantId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Informe o nome do funil.');
      const clash = await this.prisma.funil.findFirst({
        where: { tenantId, name, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException('Já existe um funil com este nome.');
      }
      await this.prisma.funil.update({
        where: { id },
        data: { name },
      });
    }

    return this.findOne(id, requester);
  }

  async ativar(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(id, tenantId);

    await this.prisma.$transaction([
      this.prisma.funil.updateMany({
        where: { tenantId, ativo: true },
        data: { ativo: false },
      }),
      this.prisma.funil.update({
        where: { id },
        data: { ativo: true },
      }),
    ]);

    return this.findOne(id, requester);
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const funil = await this.ensureOwned(id, tenantId);

    const total = await this.prisma.funil.count({ where: { tenantId } });
    if (total <= 1) {
      throw new BadRequestException(
        'Não é possível excluir o único funil do tenant.',
      );
    }
    if (funil.ativo) {
      throw new BadRequestException(
        'Ative outro funil antes de excluir o funil em uso.',
      );
    }

    await this.prisma.funil.delete({ where: { id } });
    return { ok: true };
  }

  async addEtapa(
    funilId: string,
    dto: CreateFunilEtapaDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);

    const label = dto.label.trim();
    const slug = await this.uniqueSlug(funilId, slugify(label));
    const last = await this.prisma.funilEtapa.findFirst({
      where: { funilId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    try {
      await this.prisma.funilEtapa.create({
        data: {
          funilId,
          label,
          slug,
          color: dto.color?.trim() || 'bg-slate-200 text-slate-700',
          sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
          active: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma etapa com este nome.');
      }
      throw err;
    }

    return this.findOne(funilId, requester);
  }

  async updateEtapa(
    funilId: string,
    etapaId: string,
    dto: UpdateFunilEtapaDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);
    const etapa = await this.prisma.funilEtapa.findFirst({
      where: { id: etapaId, funilId },
    });
    if (!etapa) throw new NotFoundException('Etapa não encontrada.');

    if (
      etapa.slug === DEFAULT_INITIAL_STAGE_SLUG &&
      dto.active === false
    ) {
      throw new BadRequestException(
        'A etapa inicial (Novo lead) não pode ser desativada.',
      );
    }

    const data: Prisma.FunilEtapaUpdateInput = {};
    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) throw new BadRequestException('Informe o nome da etapa.');
      data.label = label;
      // slug permanece estável (igual catalog) para não quebrar Lead.stage
    }
    if (dto.color !== undefined) data.color = dto.color.trim();
    if (dto.active !== undefined) data.active = dto.active;

    try {
      await this.prisma.funilEtapa.update({
        where: { id: etapaId },
        data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma etapa com este nome.');
      }
      throw err;
    }

    return this.findOne(funilId, requester);
  }

  async removeEtapa(
    funilId: string,
    etapaId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);
    const etapa = await this.prisma.funilEtapa.findFirst({
      where: { id: etapaId, funilId },
    });
    if (!etapa) throw new NotFoundException('Etapa não encontrada.');
    if (etapa.slug === DEFAULT_INITIAL_STAGE_SLUG) {
      throw new BadRequestException(
        'A etapa inicial (Novo lead) não pode ser removida.',
      );
    }

    const activeCount = await this.prisma.funilEtapa.count({
      where: { funilId, active: true },
    });
    if (etapa.active && activeCount <= 1) {
      throw new BadRequestException(
        'O funil precisa ter ao menos uma etapa ativa.',
      );
    }

    await this.prisma.funilEtapa.update({
      where: { id: etapaId },
      data: { active: false },
    });

    return this.findOne(funilId, requester);
  }

  async reorderEtapas(
    funilId: string,
    dto: ReorderFunilEtapasDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);

    const existentes = await this.prisma.funilEtapa.findMany({
      where: { funilId },
      select: { id: true },
    });
    const idSet = new Set(existentes.map((e) => e.id));
    if (
      dto.orderedIds.length !== idSet.size ||
      dto.orderedIds.some((id) => !idSet.has(id))
    ) {
      throw new BadRequestException('Lista de etapas inválida para reordenação.');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.funilEtapa.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findOne(funilId, requester);
  }

  /**
   * Restaura etapas padrão no funil (reativa/atualiza por slug; não apaga custom).
   */
  async installDefaults(funilId: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);

    for (const stage of DEFAULT_FUNNEL_STAGES) {
      const existing = await this.prisma.funilEtapa.findFirst({
        where: { funilId, slug: stage.slug },
      });
      if (existing) {
        await this.prisma.funilEtapa.update({
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
      try {
        await this.prisma.funilEtapa.create({
          data: {
            funilId,
            label: stage.label,
            slug: stage.slug,
            color: stage.color,
            sortOrder: stage.sortOrder,
            active: true,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // label clash — atualiza o registro conflitante
          const clash = await this.prisma.funilEtapa.findFirst({
            where: { funilId, label: stage.label },
          });
          if (clash) {
            await this.prisma.funilEtapa.update({
              where: { id: clash.id },
              data: {
                slug: stage.slug,
                color: stage.color,
                sortOrder: stage.sortOrder,
                active: true,
              },
            });
          }
        } else {
          throw err;
        }
      }
    }

    return this.findOne(funilId, requester);
  }

  /** Usado por CatalogService / leads — etapas ativas do funil em uso. */
  async getActiveStageSlugs(tenantId: string): Promise<string[]> {
    const funil = await this.ensureTenantHasFunil(tenantId);
    return funil.etapas.filter((e) => e.active).map((e) => e.slug);
  }

  async getDefaultStageSlug(tenantId: string): Promise<string> {
    const funil = await this.ensureTenantHasFunil(tenantId);
    const stages = funil.etapas.filter((e) => e.active);
    const initial = stages.find((e) => e.slug === DEFAULT_INITIAL_STAGE_SLUG);
    if (initial) return initial.slug;
    if (stages[0]) return stages[0].slug;
    throw new BadRequestException(
      'Nenhuma etapa ativa no funil. Cadastre etapas em Configurações.',
    );
  }

  /** Mapeia etapas do funil ativo no formato CatalogItem (compat). */
  async listActiveAsCatalogItems(tenantId: string) {
    const funil = await this.ensureTenantHasFunil(tenantId);
    return funil.etapas
      .filter((e) => e.active)
      .map((e) => ({
        id: e.id,
        tenantId,
        type: CatalogType.funil_etapa,
        label: e.label,
        slug: e.slug,
        color: e.color,
        sortOrder: e.sortOrder,
        active: e.active,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));
  }

  private buildEtapasCreate(etapas: CreateFunilEtapaDto[]) {
    const usedSlugs = new Set<string>();
    const rows = etapas.map((e, index) => {
      const label = e.label.trim();
      let slug = slugify(label) || `etapa-${index + 1}`;
      if (usedSlugs.has(slug)) {
        let n = 2;
        while (usedSlugs.has(`${slug}-${n}`)) n += 1;
        slug = `${slug}-${n}`;
      }
      usedSlugs.add(slug);
      return {
        label,
        slug,
        color: e.color?.trim() || 'bg-slate-200 text-slate-700',
        sortOrder: e.sortOrder ?? index,
        active: true,
      };
    });

    if (!rows.some((r) => r.slug === DEFAULT_INITIAL_STAGE_SLUG)) {
      rows.unshift({
        label: 'Novo lead',
        slug: DEFAULT_INITIAL_STAGE_SLUG,
        color: DEFAULT_FUNNEL_STAGES[0]!.color,
        sortOrder: 0,
        active: true,
      });
      rows.forEach((r, i) => {
        r.sortOrder = i;
      });
    }

    return rows;
  }

  private async uniqueSlug(funilId: string, base: string): Promise<string> {
    let slug = base || 'etapa';
    let n = 2;
    while (
      await this.prisma.funilEtapa.findFirst({
        where: { funilId, slug },
        select: { id: true },
      })
    ) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  private async ensureOwned(id: string, tenantId: string) {
    const funil = await this.prisma.funil.findFirst({
      where: { id, tenantId },
      select: { id: true, ativo: true, name: true },
    });
    if (!funil) throw new NotFoundException('Funil não encontrado.');
    return funil;
  }

  /**
   * Garante ao menos um funil ativo. Preferência: existente → backfill catálogo → defaults.
   */
  async ensureTenantHasFunil(tenantId: string) {
    const ativo = await this.prisma.funil.findFirst({
      where: { tenantId, ativo: true },
      select: funilSelect,
    });
    if (ativo) return ativo;

    const qualquer = await this.prisma.funil.findFirst({
      where: { tenantId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (qualquer) {
      await this.prisma.funil.update({
        where: { id: qualquer.id },
        data: { ativo: true },
      });
      return this.prisma.funil.findFirstOrThrow({
        where: { id: qualquer.id },
        select: funilSelect,
      });
    }

    const fromCatalog = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: CatalogType.funil_etapa },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    const etapas =
      fromCatalog.length > 0
        ? fromCatalog.map((c, i) => ({
            label: c.label,
            slug: c.slug || slugify(c.label) || `etapa-${i + 1}`,
            color: c.color || 'bg-slate-200 text-slate-700',
            sortOrder: c.sortOrder,
            active: c.active,
          }))
        : DEFAULT_FUNNEL_STAGES.map((s) => ({
            label: s.label,
            slug: s.slug,
            color: s.color,
            sortOrder: s.sortOrder,
            active: true,
          }));

    return this.prisma.funil.create({
      data: {
        tenantId,
        name: 'Funil padrão',
        ativo: true,
        etapas: { create: etapas },
      },
      select: funilSelect,
    });
  }
}
