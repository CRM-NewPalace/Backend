import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogType, FunilEtapaPapel, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
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

/** Slugs legados usados como fallback quando `papel` ainda não foi atribuído. */
const LEGACY_PAPEL_BY_SLUG: Record<string, FunilEtapaPapel> = {
  novo: FunilEtapaPapel.inicial,
  'em-analise': FunilEtapaPapel.analise,
  'ganho-venda': FunilEtapaPapel.venda,
  venda: FunilEtapaPapel.venda,
  perdido: FunilEtapaPapel.perdido,
};

const etapaSelect = {
  id: true,
  funilId: true,
  label: true,
  slug: true,
  color: true,
  sortOrder: true,
  active: true,
  papel: true,
  prazoValor: true,
  prazoUnidade: true,
  alertaAntecedenciaPercent: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FunilEtapaSelect;

const funilSelect = {
  id: true,
  tenantId: true,
  name: true,
  ativo: true,
  inatividadeValor: true,
  inatividadeUnidade: true,
  createdAt: true,
  updatedAt: true,
  etapas: {
    orderBy: [{ sortOrder: 'asc' as const }, { label: 'asc' as const }],
    select: etapaSelect,
  },
} satisfies Prisma.FunilSelect;

type EtapaComPapel = {
  id: string;
  slug: string;
  active: boolean;
  papel: FunilEtapaPapel | null;
};

@Injectable()
export class FunisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoramento: LeadMonitoramentoService,
  ) {}

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
          ? [
              {
                label: 'Novo lead',
                color: DEFAULT_FUNNEL_STAGES[0]!.color,
                papel: FunilEtapaPapel.inicial,
              },
            ]
          : DEFAULT_FUNNEL_STAGES.map((s) => ({
              label: s.label,
              color: s.color,
              sortOrder: s.sortOrder,
              papel: s.papel ?? null,
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

    const data: Prisma.FunilUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Informe o nome do funil.');
      const clash = await this.prisma.funil.findFirst({
        where: { tenantId, name, NOT: { id } },
      });
      if (clash) {
        throw new ConflictException('Já existe um funil com este nome.');
      }
      data.name = name;
    }
    if (dto.inatividadeValor !== undefined) {
      data.inatividadeValor = dto.inatividadeValor;
    }
    if (dto.inatividadeUnidade !== undefined) {
      data.inatividadeUnidade = dto.inatividadeUnidade;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.funil.update({
        where: { id },
        data,
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

    const ativo = await this.prisma.funil.findFirst({
      where: { tenantId, ativo: true, NOT: { id } },
      select: { id: true },
    });

    await this.prisma.funil.delete({ where: { id } });

    if (ativo) {
      const remaining = await this.prisma.funil.findFirst({
        where: { id: ativo.id },
        select: funilSelect,
      });
      if (remaining) {
        await this.attachOrphanStages(tenantId, remaining);
      }
    }

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

    const papel =
      dto.papel === undefined
        ? (LEGACY_PAPEL_BY_SLUG[slug] ?? null)
        : dto.papel;

    await this.prisma.$transaction(async (tx) => {
      if (papel) {
        await this.clearPapelOnOthers(tx, funilId, papel, null);
      }
      try {
        await tx.funilEtapa.create({
          data: {
            funilId,
            label,
            slug,
            color: dto.color?.trim() || 'bg-slate-200 text-slate-700',
            sortOrder: dto.sortOrder ?? (last?.sortOrder ?? -1) + 1,
            active: true,
            papel,
            prazoValor: dto.prazoValor ?? null,
            ...(dto.prazoUnidade ? { prazoUnidade: dto.prazoUnidade } : {}),
            ...(dto.alertaAntecedenciaPercent !== undefined
              ? { alertaAntecedenciaPercent: dto.alertaAntecedenciaPercent }
              : {}),
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
    });

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

    const nextPapel =
      dto.papel !== undefined ? dto.papel : etapa.papel;
    const willBeInitial =
      this.resolveEtapaPapel({ ...etapa, papel: nextPapel }) ===
      FunilEtapaPapel.inicial;

    if (willBeInitial && dto.active === false) {
      throw new BadRequestException(
        'A etapa inicial não pode ser desativada. Atribua o papel Inicial a outra etapa antes.',
      );
    }

    if (
      this.resolveEtapaPapel(etapa) === FunilEtapaPapel.inicial &&
      dto.papel !== undefined &&
      dto.papel !== FunilEtapaPapel.inicial
    ) {
      const otherInitial = await this.prisma.funilEtapa.findFirst({
        where: {
          funilId,
          active: true,
          id: { not: etapaId },
          OR: [
            { papel: FunilEtapaPapel.inicial },
            { papel: null, slug: DEFAULT_INITIAL_STAGE_SLUG },
          ],
        },
        select: { id: true },
      });
      if (!otherInitial) {
        throw new BadRequestException(
          'Atribua o papel Inicial a outra etapa antes de remover desta.',
        );
      }
    }

    const data: Prisma.FunilEtapaUpdateInput = {};
    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) throw new BadRequestException('Informe o nome da etapa.');
      data.label = label;
    }
    if (dto.color !== undefined) data.color = dto.color.trim();
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.papel !== undefined) data.papel = dto.papel;
    if (dto.prazoValor !== undefined) data.prazoValor = dto.prazoValor;
    if (dto.prazoUnidade !== undefined) data.prazoUnidade = dto.prazoUnidade;
    if (dto.alertaAntecedenciaPercent !== undefined) {
      data.alertaAntecedenciaPercent = dto.alertaAntecedenciaPercent;
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.papel) {
        await this.clearPapelOnOthers(tx, funilId, dto.papel, etapaId);
      }
      try {
        await tx.funilEtapa.update({
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
    });

    if (
      dto.prazoValor !== undefined ||
      dto.prazoUnidade !== undefined ||
      dto.alertaAntecedenciaPercent !== undefined
    ) {
      await this.monitoramento.recalculateStagePrazos(tenantId, etapa.slug);
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
    if (this.resolveEtapaPapel(etapa) === FunilEtapaPapel.inicial) {
      throw new BadRequestException(
        'A etapa inicial não pode ser removida. Atribua o papel Inicial a outra etapa antes.',
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

    const siblings = await this.prisma.funilEtapa.findMany({
      where: { funilId, active: true, id: { not: etapaId } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, slug: true, papel: true, active: true },
    });
    const fallbackSlug =
      siblings.find(
        (e) => this.resolveEtapaPapel(e) === FunilEtapaPapel.inicial,
      )?.slug ?? siblings[0]?.slug;

    if (fallbackSlug && fallbackSlug !== etapa.slug) {
      await this.prisma.lead.updateMany({
        where: { tenantId, perdidoAt: null, stage: etapa.slug },
        data: { stage: fallbackSlug },
      });
    }

    await this.prisma.funilEtapa.delete({
      where: { id: etapaId },
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
      const papel = stage.papel ?? null;
      const existing = await this.prisma.funilEtapa.findFirst({
        where: { funilId, slug: stage.slug },
      });
      if (existing) {
        if (papel) {
          await this.clearPapelOnOthers(
            this.prisma,
            funilId,
            papel as FunilEtapaPapel,
            existing.id,
          );
        }
        await this.prisma.funilEtapa.update({
          where: { id: existing.id },
          data: {
            label: stage.label,
            color: stage.color,
            sortOrder: stage.sortOrder,
            active: true,
            papel,
          },
        });
        continue;
      }
      try {
        if (papel) {
          await this.clearPapelOnOthers(
            this.prisma,
            funilId,
            papel as FunilEtapaPapel,
            null,
          );
        }
        await this.prisma.funilEtapa.create({
          data: {
            funilId,
            label: stage.label,
            slug: stage.slug,
            color: stage.color,
            sortOrder: stage.sortOrder,
            active: true,
            papel,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const clash = await this.prisma.funilEtapa.findFirst({
            where: { funilId, label: stage.label },
          });
          if (clash) {
            if (papel) {
              await this.clearPapelOnOthers(
                this.prisma,
                funilId,
                papel as FunilEtapaPapel,
                clash.id,
              );
            }
            await this.prisma.funilEtapa.update({
              where: { id: clash.id },
              data: {
                slug: stage.slug,
                color: stage.color,
                sortOrder: stage.sortOrder,
                active: true,
                papel,
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
    const slug = await this.getSlugByPapel(tenantId, FunilEtapaPapel.inicial);
    if (slug) return slug;
    const funil = await this.ensureTenantHasFunil(tenantId);
    const stages = funil.etapas.filter((e) => e.active);
    if (stages[0]) return stages[0].slug;
    throw new BadRequestException(
      'Nenhuma etapa ativa no funil. Cadastre etapas em Configurações.',
    );
  }

  /** Slug da etapa ativa com o papel dado (funil ativo), ou null. */
  async getSlugByPapel(
    tenantId: string,
    papel: FunilEtapaPapel,
  ): Promise<string | null> {
    const slugs = await this.getSlugsByPapel(tenantId, papel);
    return slugs[0] ?? null;
  }

  /**
   * Todos os slugs ativos do papel (funil personalizado).
   * Fallback por label quando o papel ainda não foi atribuído.
   */
  async getSlugsByPapel(
    tenantId: string,
    papel: FunilEtapaPapel,
  ): Promise<string[]> {
    const funil = await this.ensureTenantHasFunil(tenantId);
    const byPapel = funil.etapas
      .filter((e) => e.active && this.resolveEtapaPapel(e) === papel)
      .map((e) => e.slug);
    if (byPapel.length > 0) return [...new Set(byPapel)];

    if (papel === FunilEtapaPapel.venda) {
      return [
        ...new Set(
          funil.etapas
            .filter(
              (e) =>
                e.active &&
                /venda/i.test(e.label) &&
                !/perdid|perda/i.test(e.label),
            )
            .map((e) => e.slug),
        ),
      ];
    }
    if (papel === FunilEtapaPapel.perdido) {
      return [
        ...new Set(
          funil.etapas
            .filter(
              (e) => e.active && /perdid|perda/i.test(e.label),
            )
            .map((e) => e.slug),
        ),
      ];
    }
    if (papel === FunilEtapaPapel.analise) {
      return [
        ...new Set(
          funil.etapas
            .filter(
              (e) =>
                e.active &&
                /an[aá]lise/i.test(e.label),
            )
            .map((e) => e.slug),
        ),
      ];
    }
    return [];
  }

  /** Papel efetivo da etapa (campo ou fallback por slug legado). */
  async getPapelBySlug(
    tenantId: string,
    slug: string,
  ): Promise<FunilEtapaPapel | null> {
    const funil = await this.ensureTenantHasFunil(tenantId);
    const etapa = funil.etapas.find((e) => e.slug === slug);
    if (!etapa) return LEGACY_PAPEL_BY_SLUG[slug] ?? null;
    return this.resolveEtapaPapel(etapa);
  }

  /** Mapeia etapas do funil ativo no formato CatalogItem (compat + papel). */
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
        papel: this.resolveEtapaPapel(e),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));
  }

  resolveEtapaPapel(etapa: EtapaComPapel): FunilEtapaPapel | null {
    if (etapa.papel) return etapa.papel;
    return LEGACY_PAPEL_BY_SLUG[etapa.slug] ?? null;
  }

  private async clearPapelOnOthers(
    db: Prisma.TransactionClient | PrismaService,
    funilId: string,
    papel: FunilEtapaPapel,
    keepId: string | null,
  ) {
    await db.funilEtapa.updateMany({
      where: {
        funilId,
        papel,
        ...(keepId ? { id: { not: keepId } } : {}),
      },
      data: { papel: null },
    });
  }

  private buildEtapasCreate(etapas: CreateFunilEtapaDto[]) {
    const usedSlugs = new Set<string>();
    const usedPapeis = new Set<FunilEtapaPapel>();
    const rows = etapas.map((e, index) => {
      const label = e.label.trim();
      let slug = slugify(label) || `etapa-${index + 1}`;
      if (usedSlugs.has(slug)) {
        let n = 2;
        while (usedSlugs.has(`${slug}-${n}`)) n += 1;
        slug = `${slug}-${n}`;
      }
      usedSlugs.add(slug);

      let papel: FunilEtapaPapel | null =
        e.papel === undefined
          ? (LEGACY_PAPEL_BY_SLUG[slug] ?? null)
          : e.papel;
      if (papel && usedPapeis.has(papel)) {
        papel = null;
      }
      if (papel) usedPapeis.add(papel);

      return {
        label,
        slug,
        color: e.color?.trim() || 'bg-slate-200 text-slate-700',
        sortOrder: e.sortOrder ?? index,
        active: true,
        papel,
        prazoValor: e.prazoValor ?? null,
        ...(e.prazoUnidade ? { prazoUnidade: e.prazoUnidade } : {}),
        ...(e.alertaAntecedenciaPercent !== undefined
          ? { alertaAntecedenciaPercent: e.alertaAntecedenciaPercent }
          : {}),
      };
    });

    if (!rows.some((r) => r.papel === FunilEtapaPapel.inicial)) {
      const bySlug = rows.find((r) => r.slug === DEFAULT_INITIAL_STAGE_SLUG);
      if (bySlug) {
        bySlug.papel = FunilEtapaPapel.inicial;
      } else {
        rows.unshift({
          label: 'Novo lead',
          slug: DEFAULT_INITIAL_STAGE_SLUG,
          color: DEFAULT_FUNNEL_STAGES[0]!.color,
          sortOrder: 0,
          active: true,
          papel: FunilEtapaPapel.inicial,
          prazoValor: null,
        });
        rows.forEach((r, i) => {
          r.sortOrder = i;
        });
      }
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
    if (ativo) return this.attachOrphanStages(tenantId, ativo);

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
      return this.attachOrphanStages(
        tenantId,
        await this.prisma.funil.findFirstOrThrow({
          where: { id: qualquer.id },
          select: funilSelect,
        }),
      );
    }

    const fromCatalog = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: CatalogType.funil_etapa },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });

    const etapas =
      fromCatalog.length > 0
        ? fromCatalog.map((c, i) => {
            const slug = c.slug || slugify(c.label) || `etapa-${i + 1}`;
            return {
              label: c.label,
              slug,
              color: c.color || 'bg-slate-200 text-slate-700',
              sortOrder: c.sortOrder,
              active: c.active,
              papel: LEGACY_PAPEL_BY_SLUG[slug] ?? null,
            };
          })
        : DEFAULT_FUNNEL_STAGES.map((s) => ({
            label: s.label,
            slug: s.slug,
            color: s.color,
            sortOrder: s.sortOrder,
            active: true,
            papel: s.papel ?? null,
          }));

    if (!etapas.some((e) => e.papel === FunilEtapaPapel.inicial)) {
      if (etapas[0]) etapas[0].papel = FunilEtapaPapel.inicial;
    }

    return this.attachOrphanStages(
      tenantId,
      await this.prisma.funil.create({
        data: {
          tenantId,
          name: 'Funil padrão',
          ativo: true,
          etapas: { create: etapas },
        },
        select: funilSelect,
      }),
    );
  }

  async recoverOrphanStages(funilId: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureOwned(funilId, tenantId);
    const funil = await this.prisma.funil.findFirst({
      where: { id: funilId },
      select: funilSelect,
    });
    if (!funil) throw new NotFoundException('Funil não encontrado.');
    return this.attachOrphanStages(tenantId, funil);
  }

  /**
   * Recria/reativa no funil as etapas que os leads ainda usam (Lead.stage)
   * depois que um funil antigo foi excluído.
   */
  private async attachOrphanStages(
    tenantId: string,
    funil: Prisma.FunilGetPayload<{ select: typeof funilSelect }>,
  ) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['stage'],
      where: { tenantId, perdidoAt: null },
    });
    if (grouped.length === 0) return funil;

    const etapas = [...funil.etapas];

    const findMatch = (stage: string) => {
      const trimmed = stage.trim();
      const normalized = slugify(trimmed);
      return (
        etapas.find((e) => e.slug === trimmed) ||
        etapas.find((e) => e.slug === normalized) ||
        etapas.find((e) => slugify(e.slug) === normalized) ||
        etapas.find((e) => slugify(e.label) === normalized) ||
        null
      );
    };

    let changed = false;

    for (const row of grouped) {
      const raw = row.stage;
      const stage = raw?.trim();
      if (!stage) continue;

      const found = findMatch(stage);
      if (found) {
        if (!found.active) {
          await this.prisma.funilEtapa.update({
            where: { id: found.id },
            data: { active: true },
          });
          found.active = true;
          changed = true;
        }
        if (found.slug !== raw) {
          await this.prisma.lead.updateMany({
            where: { tenantId, perdidoAt: null, stage: raw },
            data: { stage: found.slug },
          });
          changed = true;
        }
        continue;
      }

      const def =
        DEFAULT_FUNNEL_STAGES.find((s) => s.slug === stage) ??
        DEFAULT_FUNNEL_STAGES.find((s) => s.slug === slugify(stage));
      const existingLabels = new Set(
        etapas.map((e) => e.label.toLowerCase()),
      );
      let label = def?.label ?? this.labelFromSlug(stage);
      if (existingLabels.has(label.toLowerCase())) {
        label = `${label} (${stage})`;
      }

      const usedPapeis = new Set(
        etapas
          .map((e) => this.resolveEtapaPapel(e))
          .filter((p): p is FunilEtapaPapel => p != null),
      );
      let papel: FunilEtapaPapel | null =
        (def?.papel as FunilEtapaPapel | undefined) ??
        LEGACY_PAPEL_BY_SLUG[stage] ??
        LEGACY_PAPEL_BY_SLUG[slugify(stage)] ??
        null;
      if (papel && usedPapeis.has(papel)) papel = null;

      const sortOrder =
        etapas.reduce((max, e) => Math.max(max, e.sortOrder), -1) + 1;

      try {
        const created = await this.prisma.funilEtapa.create({
          data: {
            funilId: funil.id,
            label,
            slug: stage,
            color: def?.color ?? 'bg-slate-200 text-slate-700',
            sortOrder,
            active: true,
            papel,
          },
          select: etapaSelect,
        });
        etapas.push(created);
        changed = true;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const clash = await this.prisma.funilEtapa.findFirst({
            where: {
              funilId: funil.id,
              OR: [{ slug: stage }, { slug: slugify(stage) }, { label }],
            },
            select: etapaSelect,
          });
          if (clash) {
            if (!clash.active) {
              await this.prisma.funilEtapa.update({
                where: { id: clash.id },
                data: { active: true },
              });
              clash.active = true;
            }
            const already = etapas.some((e) => e.id === clash.id);
            if (!already) etapas.push(clash);
            else {
              const idx = etapas.findIndex((e) => e.id === clash.id);
              if (idx >= 0) etapas[idx] = { ...etapas[idx], active: true };
            }
            if (clash.slug !== raw) {
              await this.prisma.lead.updateMany({
                where: { tenantId, perdidoAt: null, stage: raw },
                data: { stage: clash.slug },
              });
            }
            changed = true;
          }
          continue;
        }
        throw err;
      }
    }

    if (!changed) return funil;

    return this.prisma.funil.findFirstOrThrow({
      where: { id: funil.id },
      select: funilSelect,
    });
  }

  private labelFromSlug(slug: string): string {
    const cleaned = slug.replace(/[-_]+/g, ' ').trim();
    if (!cleaned) return 'Etapa';
    return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}
