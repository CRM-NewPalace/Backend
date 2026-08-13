import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { CreateEmpreendimentoDto } from "./dto/create-empreendimento.dto";
import { UpdateEmpreendimentoDto } from "./dto/update-empreendimento.dto";
import { QueryEmpreendimentosDto } from "./dto/query-empreendimentos.dto";
import { normalizeCor } from "../common/utils/cor";
import { prismaTableOrderBy } from "../common/utils/table-sort";

const empreendimentoSelect = {
  id: true,
  nome: true,
  cor: true,
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
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryEmpreendimentosDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.prisma.empreendimento.findMany({
      where: {
        tenantId,
        ...(query.construtoraId ? { construtoraId: query.construtoraId } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      },
      select: empreendimentoSelect,
      orderBy: prismaTableOrderBy(query.sort, "nome"),
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.empreendimento.findFirst({
      where: { id, tenantId },
      select: empreendimentoSelect,
    });
    if (!item) throw new NotFoundException("Empreendimento não encontrado.");
    return item;
  }

  async create(dto: CreateEmpreendimentoDto, requester: AuthenticatedUser) {
    this.assertCanCreate(requester);
    const tenantId = requireTenantId(requester);
    if (dto.construtoraId) {
      const construtora = await this.prisma.construtora.findFirst({
        where: { id: dto.construtoraId, tenantId },
        select: { id: true },
      });
      if (!construtora) {
        throw new NotFoundException("Construtora não encontrada.");
      }
    }
    const key = this.slugify(dto.nome);
    return this.prisma.empreendimento.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cor: normalizeCor(dto.cor),
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
    this.assertCanManage(requester);
    await this.findOne(id, requester);
    return this.prisma.empreendimento.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.cor !== undefined ? { cor: normalizeCor(dto.cor) } : {}),
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
    this.assertCanRemove(requester);
    await this.findOne(id, requester);
    await this.prisma.empreendimento.delete({ where: { id } });
    return { ok: true };
  }

  private assertCanRemove(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.analista) {
      throw new ForbiddenException(
        "Apenas administradores e analistas podem remover empreendimentos.",
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
        "Apenas administradores, gerentes, analistas e treinees podem editar empreendimentos.",
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
        "Apenas administradores, gerentes, analistas e treinees podem cadastrar empreendimentos.",
      );
    }
  }

  private slugify(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
}
