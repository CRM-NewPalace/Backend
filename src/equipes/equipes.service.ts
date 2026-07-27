import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipeDto } from './dto/create-equipe.dto';
import { UpdateEquipeDto } from './dto/update-equipe.dto';

const equipeSelect = {
  id: true,
  name: true,
  status: true,
  gerenteId: true,
  createdAt: true,
  updatedAt: true,
  gerente: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
  membros: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
    orderBy: { name: 'asc' as const },
  },
} satisfies Prisma.EquipeSelect;

@Injectable()
export class EquipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser) {
    if (requester.role === Role.admin) {
      return this.prisma.equipe.findMany({
        select: equipeSelect,
        orderBy: { name: 'asc' },
      });
    }

    // Gerente: só a equipe que lidera.
    return this.prisma.equipe.findMany({
      where: { gerenteId: requester.id },
      select: equipeSelect,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id },
      select: equipeSelect,
    });
    if (!equipe) {
      throw new NotFoundException('Equipe não encontrada.');
    }
    if (
      requester.role === Role.gerente &&
      equipe.gerenteId !== requester.id
    ) {
      throw new ForbiddenException(
        'Você só pode visualizar a equipe que lidera.',
      );
    }
    return equipe;
  }

  /** Gerentes ativos ainda sem equipe. */
  async listAvailableGerentes(excludeEquipeId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: Role.gerente,
        status: UserStatus.ativo,
        OR: [
          { equipeGerenciada: null },
          ...(excludeEquipeId
            ? [{ equipeGerenciada: { id: excludeEquipeId } }]
            : []),
        ],
      },
      select: { id: true, name: true, email: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Corretores ativos livres ou já nesta equipe. */
  async listAvailableCorretores(excludeEquipeId?: string) {
    return this.prisma.user.findMany({
      where: {
        role: Role.corretor,
        status: UserStatus.ativo,
        OR: [
          { equipeId: null },
          ...(excludeEquipeId ? [{ equipeId: excludeEquipeId }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        equipeId: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEquipeDto) {
    await this.ensureGerenteEligible(dto.gerenteId);
    const membroIds = [...new Set(dto.membroIds ?? [])];
    await this.ensureCorretoresEligible(membroIds);

    return this.prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.create({
        data: {
          name: dto.name.trim(),
          status: dto.status ?? UserStatus.ativo,
          gerenteId: dto.gerenteId,
        },
      });

      if (membroIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: membroIds } },
          data: { equipeId: equipe.id },
        });
      }

      return tx.equipe.findUniqueOrThrow({
        where: { id: equipe.id },
        select: equipeSelect,
      });
    });
  }

  async update(id: string, dto: UpdateEquipeDto) {
    const existing = await this.prisma.equipe.findUnique({
      where: { id },
      select: { id: true, gerenteId: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipe não encontrada.');
    }

    if (dto.gerenteId && dto.gerenteId !== existing.gerenteId) {
      await this.ensureGerenteEligible(dto.gerenteId, id);
    }

    const membroIds =
      dto.membroIds !== undefined
        ? [...new Set(dto.membroIds)]
        : undefined;
    if (membroIds) {
      await this.ensureCorretoresEligible(membroIds, id);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.equipe.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.gerenteId !== undefined
            ? { gerenteId: dto.gerenteId }
            : {}),
        },
      });

      if (membroIds) {
        // Remove quem saiu.
        await tx.user.updateMany({
          where: {
            equipeId: id,
            id: { notIn: membroIds },
          },
          data: { equipeId: null },
        });
        // Inclui/mantém os informados.
        if (membroIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: membroIds } },
            data: { equipeId: id },
          });
        }
      }

      return tx.equipe.findUniqueOrThrow({
        where: { id },
        select: equipeSelect,
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.equipe.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipe não encontrada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { equipeId: id },
        data: { equipeId: null },
      });
      await tx.equipe.delete({ where: { id } });
    });

    return { ok: true };
  }

  private async ensureGerenteEligible(
    gerenteId: string,
    allowEquipeId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: gerenteId },
      select: {
        id: true,
        role: true,
        status: true,
        equipeGerenciada: { select: { id: true } },
      },
    });

    if (!user || user.status !== UserStatus.ativo) {
      throw new BadRequestException('Gerente não encontrado ou inativo.');
    }
    if (user.role !== Role.gerente) {
      throw new BadRequestException(
        'O líder da equipe precisa ter o perfil gerente.',
      );
    }
    if (
      user.equipeGerenciada &&
      user.equipeGerenciada.id !== allowEquipeId
    ) {
      throw new ConflictException('Este gerente já lidera outra equipe.');
    }
  }

  private async ensureCorretoresEligible(
    membroIds: string[],
    allowEquipeId?: string,
  ) {
    if (membroIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: membroIds } },
      select: {
        id: true,
        role: true,
        status: true,
        equipeId: true,
        name: true,
      },
    });

    if (users.length !== membroIds.length) {
      throw new BadRequestException(
        'Um ou mais corretores informados não existem.',
      );
    }

    for (const u of users) {
      if (u.role !== Role.corretor) {
        throw new BadRequestException(
          `"${u.name}" não é corretor e não pode entrar na equipe.`,
        );
      }
      if (u.status !== UserStatus.ativo) {
        throw new BadRequestException(`"${u.name}" está inativo.`);
      }
      if (u.equipeId && u.equipeId !== allowEquipeId) {
        throw new ConflictException(
          `"${u.name}" já pertence a outra equipe.`,
        );
      }
    }
  }
}
