import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';

/**
 * Escopo de dados por equipe, sempre aninhado ao tenant do requester:
 * - admin / analista → todos do tenant
 * - gerente → só corretores da equipe que lidera
 * - corretor → só o próprio
 */
@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** IDs dos corretores visíveis para o requester (null = sem filtro de corretor / admin|analista). */
  async getVisibleCorretorIds(
    requester: AuthenticatedUser,
  ): Promise<string[] | null> {
    const tenantId = requireTenantId(requester);

    if (requester.role === Role.admin || requester.role === Role.analista) {
      return null;
    }

    if (requester.role === Role.corretor) {
      return [requester.id];
    }

    // gerente
    const equipe = await this.prisma.equipe.findFirst({
      where: { gerenteId: requester.id, tenantId },
      select: {
        membros: {
          where: { role: Role.corretor, tenantId },
          select: { id: true },
        },
      },
    });

    return equipe?.membros.map((m) => m.id) ?? [];
  }

  /** Filtro Prisma para leads/documentação baseado na equipe + tenant. */
  async leadScope(
    requester: AuthenticatedUser,
  ): Promise<Prisma.LeadWhereInput> {
    const tenantId = requireTenantId(requester);
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return { tenantId };

    if (requester.role === Role.gerente) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { gerenteId: requester.id, tenantId },
        select: { id: true },
      });
      return {
        tenantId,
        OR: [
          { corretorId: { in: ids } },
          ...(equipe
            ? [{ equipeId: equipe.id, corretorId: null as null }]
            : []),
        ],
      };
    }

    return { tenantId, corretorId: { in: ids } };
  }

  /** true se o corretor está no escopo do requester. */
  async canAccessCorretor(
    requester: AuthenticatedUser,
    corretorId: string | null | undefined,
    equipeId?: string | null,
  ): Promise<boolean> {
    requireTenantId(requester);
    if (!corretorId) {
      if (requester.role === Role.admin || requester.role === Role.analista) {
        return true;
      }
      // Gerente vê pool da própria equipe (sem corretor ainda).
      if (requester.role === Role.gerente && equipeId) {
        const equipe = await this.prisma.equipe.findFirst({
          where: {
            id: equipeId,
            gerenteId: requester.id,
            tenantId: requireTenantId(requester),
          },
          select: { id: true },
        });
        return Boolean(equipe);
      }
      return false;
    }
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return true;
    return ids.includes(corretorId);
  }
}
