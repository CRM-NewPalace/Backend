import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * Escopo de dados por equipe:
 * - admin / analista → global
 * - gerente → só corretores da equipe que lidera
 * - corretor → só o próprio
 */
@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** IDs dos corretores visíveis para o requester (null = sem filtro / admin|analista). */
  async getVisibleCorretorIds(
    requester: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (requester.role === Role.admin || requester.role === Role.analista) {
      return null;
    }

    if (requester.role === Role.corretor) {
      return [requester.id];
    }

    // gerente
    const equipe = await this.prisma.equipe.findUnique({
      where: { gerenteId: requester.id },
      select: {
        membros: {
          where: { role: Role.corretor },
          select: { id: true },
        },
      },
    });

    return equipe?.membros.map((m) => m.id) ?? [];
  }

  /** Filtro Prisma para leads/documentação baseado na equipe. */
  async leadScope(
    requester: AuthenticatedUser,
  ): Promise<Prisma.LeadWhereInput> {
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return {};
    return { corretorId: { in: ids } };
  }

  /** true se o corretor está no escopo do requester. */
  async canAccessCorretor(
    requester: AuthenticatedUser,
    corretorId: string | null | undefined,
  ): Promise<boolean> {
    if (!corretorId) {
      // Lead sem dono: admin e analista veem.
      return (
        requester.role === Role.admin || requester.role === Role.analista
      );
    }
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return true;
    return ids.includes(corretorId);
  }
}
