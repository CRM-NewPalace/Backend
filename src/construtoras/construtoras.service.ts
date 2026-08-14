import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role, CatalogType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { prismaTableOrderBy } from "../common/utils/table-sort";
import { QueryConstrutorasDto } from "./dto/query-construtoras.dto";
import { CreateConstrutoraDto } from "./dto/create-construtora.dto";
import { UpdateConstrutoraDto } from "./dto/update-construtora.dto";

const construtoraSelect = {
  id: true,
  nome: true,
  cor: true,
  contato: true,
  endereco: true,
  viabilizadorNome: true,
  viabilizadorContato: true,
  cca: true,
  driveFolderUrl: true,
  createdAt: true,
  updatedAt: true,
  localidades: {
    select: { id: true, nome: true },
    orderBy: { nome: "asc" as const },
  },
  _count: { select: { empreendimentos: true, documentacoes: true } },
} as const;

function normalizeCor(cor?: string | null): string | null {
  if (cor == null) return null;
  const trimmed = cor.trim();
  return trimmed ? trimmed : null;
}

function normalizeDriveFolderUrl(url?: string | null): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class ConstrutorasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryConstrutorasDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const AND: Prisma.ConstrutoraWhereInput[] = [{ tenantId }];
    if (query.localidadeId) {
      AND.push({
        localidades: { some: { id: query.localidadeId } },
      });
    }
    if (query.search) {
      AND.push({
        nome: { contains: query.search, mode: "insensitive" },
      });
    }
    if (query.comDrive) {
      AND.push({ driveFolderUrl: { not: null } });
      AND.push({ NOT: { driveFolderUrl: "" } });
    }
    const items = await this.prisma.construtora.findMany({
      where: { AND },
      select: construtoraSelect,
      orderBy: prismaTableOrderBy(query.sort, "nome"),
    });
    return items.map((item) =>
      this.hideViabilizadorContatoIfNeeded(item, requester),
    );
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: construtoraSelect,
    });
    if (!item) throw new NotFoundException("Construtora não encontrada.");
    return this.hideViabilizadorContatoIfNeeded(item, requester);
  }

  async create(dto: CreateConstrutoraDto, requester: AuthenticatedUser) {
    this.assertCanCreate(requester);
    const tenantId = requireTenantId(requester);
    const localidadeIds = await this.resolveLocalidadeIds(
      tenantId,
      dto.localidadeIds,
    );
    return this.prisma.construtora.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cor: normalizeCor(dto.cor),
        contato: dto.contato?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        viabilizadorNome: dto.viabilizadorNome?.trim() || null,
        viabilizadorContato: dto.viabilizadorContato?.trim() || null,
        cca: await this.resolveCca(tenantId, dto.cca),
        driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl),
        ...(localidadeIds !== undefined
          ? { localidades: { connect: localidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      select: construtoraSelect,
    });
  }

  async update(
    id: string,
    dto: UpdateConstrutoraDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    await this.findOne(id, requester);
    const tenantId = requireTenantId(requester);
    const localidadeIds = await this.resolveLocalidadeIds(
      tenantId,
      dto.localidadeIds,
    );
    const cca =
      dto.cca !== undefined
        ? await this.resolveCca(tenantId, dto.cca)
        : undefined;
    return this.prisma.construtora.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.cor !== undefined ? { cor: normalizeCor(dto.cor) } : {}),
        ...(dto.contato !== undefined
          ? { contato: dto.contato?.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.viabilizadorNome !== undefined
          ? { viabilizadorNome: dto.viabilizadorNome?.trim() || null }
          : {}),
        ...(dto.viabilizadorContato !== undefined
          ? { viabilizadorContato: dto.viabilizadorContato?.trim() || null }
          : {}),
        ...(cca !== undefined ? { cca } : {}),
        ...(dto.driveFolderUrl !== undefined
          ? { driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl) }
          : {}),
        ...(localidadeIds !== undefined
          ? { localidades: { set: localidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      select: construtoraSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertAdmin(requester);
    await this.findOne(id, requester);
    await this.prisma.construtora.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveCca(
    tenantId: string,
    cca?: string | null,
  ): Promise<string | null> {
    const label = cca?.trim() || null;
    if (!label) return null;
    const item = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.cca, label, active: true },
      select: { label: true },
    });
    if (!item) {
      throw new BadRequestException(
        "CCA inválido. Cadastre o CCA em Configurações.",
      );
    }
    return item.label;
  }

  private async resolveLocalidadeIds(
    tenantId: string,
    ids?: string[],
  ): Promise<string[] | undefined> {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.prisma.localidade.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException(
        "Uma ou mais localidades são inválidas para esta imobiliária.",
      );
    }
    return unique;
  }

  private hideViabilizadorContatoIfNeeded<
    T extends { viabilizadorContato: string | null },
  >(item: T, requester: AuthenticatedUser): T {
    if (requester.role !== Role.corretor) return item;
    return { ...item, viabilizadorContato: null };
  }

  private assertAdmin(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        "Apenas administradores podem editar ou remover construtoras.",
      );
    }
  }

  private assertCanManage(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas e treinees podem editar construtoras.",
      );
    }
  }

  private assertCanCreate(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas e treinees podem cadastrar construtoras.",
      );
    }
  }
}
