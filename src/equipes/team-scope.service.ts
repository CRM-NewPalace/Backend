import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';

/**
 * Escopo de dados por equipe, sempre aninhado ao tenant do requester:
 * - admin / analista → todos do tenant
 * - gerente → equipe própria + carteira própria + pool do admin (leads sem dono)
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

    if (isCorretorLike(requester.role)) {
      return [requester.id];
    }

    // gerente → corretores de todas as equipes + o próprio (carteira/vendas)
    const equipes = await this.prisma.equipe.findMany({
      where: { gerenteId: requester.id, tenantId },
      select: {
        membros: {
          where: { role: { in: [Role.corretor, Role.treinee] }, tenantId },
          select: { id: true },
        },
      },
    });

    const membroIds = equipes.flatMap((e) => e.membros.map((m) => m.id));
    return [...new Set([requester.id, ...membroIds])];
  }

  /** Filtro Prisma para leads/documentação baseado na equipe + tenant. */
  async leadScope(
    requester: AuthenticatedUser,
  ): Promise<Prisma.LeadWhereInput> {
    const tenantId = requireTenantId(requester);
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return { tenantId };

    if (requester.role === Role.gerente) {
      const equipes = await this.prisma.equipe.findMany({
        where: { gerenteId: requester.id, tenantId },
        select: { id: true },
      });
      return {
        tenantId,
        OR: [
          { corretorId: { in: ids } },
          // Pool das equipes do gerente.
          ...equipes.map((equipe) => ({
            equipeId: equipe.id,
            corretorId: null as null,
          })),
          // Pool do admin (leads aguardando distribuição).
          { equipeId: null, corretorId: null },
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
      // Gerente: pool do admin (sem equipe) ou pool da própria equipe.
      if (requester.role === Role.gerente) {
        if (!equipeId) return true;
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
    // Admin/gerente acessam a própria carteira.
    if (
      (requester.role === Role.admin || requester.role === Role.gerente) &&
      corretorId === requester.id
    ) {
      return true;
    }
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return true;
    return ids.includes(corretorId);
  }
}
