import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
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
  driveFolderUrl: true,
  createdAt: true,
  updatedAt: true,
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

  list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.prisma.construtora.findMany({
      where: { tenantId },
      select: construtoraSelect,
      orderBy: { nome: "asc" },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: construtoraSelect,
    });
    if (!item) throw new NotFoundException("Construtora não encontrada.");
    return item;
  }

  create(dto: CreateConstrutoraDto, requester: AuthenticatedUser) {
    this.assertCanCreate(requester);
    const tenantId = requireTenantId(requester);
    return this.prisma.construtora.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cor: normalizeCor(dto.cor),
        contato: dto.contato?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        viabilizadorNome: dto.viabilizadorNome?.trim() || null,
        viabilizadorContato: dto.viabilizadorContato?.trim() || null,
        driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl),
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
        ...(dto.driveFolderUrl !== undefined
          ? { driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl) }
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
