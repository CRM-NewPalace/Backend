import { Role } from '@prisma/client';

/** Perfis com o mesmo escopo operacional do corretor (própria carteira). */
export const CORRETOR_LIKE_ROLES: Role[] = [Role.corretor, Role.treinee];

export function isCorretorLike(role: Role): boolean {
  return role === Role.corretor || role === Role.treinee;
}
