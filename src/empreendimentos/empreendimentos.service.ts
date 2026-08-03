import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId, DEFAULT_TENANT_SLUG } from '../common/utils/tenant';
import { CreateEmpreendimentoDto } from './dto/create-empreendimento.dto';
import { UpdateEmpreendimentoDto } from './dto/update-empreendimento.dto';
import { QueryEmpreendimentosDto } from './dto/query-empreendimentos.dto';
import { fetchSiteEmpreendimentos } from './site-sync';

const empreendimentoSelect = {
  id: true,
  nome: true,
  construtoraId: true,
  cidade: true,
  endereco: true,
  quartos: true,
  banheiros: true,
  areaM2: true,
  externalUrl: true,
  imagemUrl: true,
  externalKey: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  construtora: { select: { id: true, nome: true, cor: true } },
} as const;

@Injectable()
export class EmpreendimentosService {
  private readonly logger = new Logger(EmpreendimentosService.name);
  private imageSyncPromises = new Map<string, Promise<void>>();
  /** Evita deleteMany repetido a cada listagem no mesmo processo. */
  private purgedTenantIds = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryEmpreendimentosDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.purgeForeignSiteCatalogIfNeeded(tenantId);

    const where = {
      tenantId,
      ...(query.construtoraId ? { construtoraId: query.construtoraId } : {}),
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
    };

    let items = await this.prisma.empreendimento.findMany({
      where,
      select: empreendimentoSelect,
      orderBy: { nome: 'asc' },
    });

    // Capas: só para o tenant New Palace (único com sync de site).
    if (
      (await this.isSiteSyncTenant(tenantId)) &&
      items.length > 0 &&
      items.some((item) => !item.imagemUrl) &&
      !query.construtoraId
    ) {
      await this.ensureCatalogImages(tenantId);
      items = await this.prisma.empreendimento.findMany({
        where,
        select: empreendimentoSelect,
        orderBy: { nome: 'asc' },
      });
    }

    return items;
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.empreendimento.findFirst({
      where: { id, tenantId },
      select: empreendimentoSelect,
    });
    if (!item) throw new NotFoundException('Empreendimento não encontrado.');
    return item;
  }

  async create(dto: CreateEmpreendimentoDto, requester: AuthenticatedUser) {
    this.assertAdminOrManager(requester);
    const tenantId = requireTenantId(requester);
    if (dto.construtoraId) {
      const construtora = await this.prisma.construtora.findFirst({
        where: { id: dto.construtoraId, tenantId },
        select: { id: true },
      });
      if (!construtora) {
        throw new NotFoundException('Construtora não encontrada.');
      }
    }
    const key = this.slugify(dto.nome);
    return this.prisma.empreendimento.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        construtoraId: dto.construtoraId ?? null,
        cidade: dto.cidade?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        quartos: dto.quartos ?? null,
        banheiros: dto.banheiros ?? null,
        areaM2: dto.areaM2 ?? null,
        externalUrl: dto.externalUrl?.trim() || null,
        imagemUrl: null,
        externalKey: `manual-${key}-${Date.now()}`,
        ativo: dto.ativo ?? true,
      },
      select: empreendimentoSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateEmpreendimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertAdmin(requester);
    await this.findOne(id, requester);
    return this.prisma.empreendimento.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.construtoraId !== undefined
          ? { construtoraId: dto.construtoraId }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.areaM2 !== undefined ? { areaM2: dto.areaM2 } : {}),
        ...(dto.externalUrl !== undefined
          ? { externalUrl: dto.externalUrl?.trim() || null }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: empreendimentoSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    await this.findOne(id, requester);
    await this.prisma.empreendimento.delete({ where: { id } });
    return { ok: true };
  }

  async syncFromSite(requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    const tenantId = requireTenantId(requester);
    if (!(await this.isSiteSyncTenant(tenantId))) {
      throw new ForbiddenException(
        'Sincronização com o site está disponível apenas para o tenant New Palace. Cadastre os imóveis manualmente.',
      );
    }
    return this.runSync(tenantId);
  }

  /**
   * Remove catálogo importado do site New Palace em tenants que não são a New Palace.
   * Itens criados manualmente (externalKey manual-*) são preservados.
   */
  private async purgeForeignSiteCatalogIfNeeded(tenantId: string) {
    if (await this.isSiteSyncTenant(tenantId)) return;
    if (this.purgedTenantIds.has(tenantId)) return;

    const result = await this.prisma.empreendimento.deleteMany({
      where: {
        tenantId,
        NOT: { externalKey: { startsWith: 'manual-' } },
      },
    });
    this.purgedTenantIds.add(tenantId);
    if (result.count > 0) {
      this.logger.log(
        `Removidos ${result.count} imóveis importados do site New Palace do tenant ${tenantId}.`,
      );
    }
  }

  private async isSiteSyncTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    return tenant?.slug === DEFAULT_TENANT_SLUG;
  }

  /** Completa uma única vez as capas do catálogo importado antes da migration. */
  private async ensureCatalogImages(tenantId: string) {
    let promise = this.imageSyncPromises.get(tenantId);
    if (!promise) {
      promise = this.runSync(tenantId)
        .then((result) => {
          this.logger.log(
            `Capas do catálogo atualizadas: ${result.updated + result.created} empreendimentos.`,
          );
        })
        .catch((err) => {
          this.logger.error(
            `Falha ao buscar capas dos empreendimentos: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        })
        .finally(() => {
          this.imageSyncPromises.delete(tenantId);
        });
      this.imageSyncPromises.set(tenantId, promise);
    }
    await promise;
  }

  private async runSync(tenantId: string) {
    const { items, source, detail } = await fetchSiteEmpreendimentos();
    if (detail) {
      this.logger.warn(detail);
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await this.prisma.empreendimento.findUnique({
        where: {
          tenantId_externalKey: { tenantId, externalKey: item.externalKey },
        },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.empreendimento.update({
          where: { id: existing.id },
          data: {
            nome: item.nome,
            cidade: item.cidade,
            endereco: item.endereco,
            quartos: item.quartos,
            banheiros: item.banheiros,
            areaM2: item.areaM2,
            externalUrl: item.externalUrl,
            imagemUrl: item.imagemUrl,
            ativo: true,
          },
        });
        updated += 1;
      } else {
        await this.prisma.empreendimento.create({
          data: {
            tenantId,
            nome: item.nome,
            cidade: item.cidade,
            endereco: item.endereco,
            quartos: item.quartos,
            banheiros: item.banheiros,
            areaM2: item.areaM2,
            externalUrl: item.externalUrl,
            imagemUrl: item.imagemUrl,
            externalKey: item.externalKey,
            ativo: true,
          },
        });
        created += 1;
      }
    }

    return {
      ok: true,
      source,
      detail: detail ?? null,
      total: items.length,
      created,
      updated,
    };
  }

  private assertAdmin(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar empreendimentos.',
      );
    }
  }

  private assertAdminOrManager(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Apenas administradores e gerentes podem cadastrar empreendimentos.',
      );
    }
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
}
