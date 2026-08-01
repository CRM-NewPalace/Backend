import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../types/authenticated-user';

/** UUID fixo do tenant default criado na migration de multitenant. */
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const DEFAULT_TENANT_SLUG = 'new-palace';

/** Exige tenantId no JWT (usuários de imobiliária). */
export function requireTenantId(user: AuthenticatedUser): string {
  if (!user.tenantId) {
    throw new ForbiddenException(
      'Esta operação requer um usuário vinculado a um tenant.',
    );
  }
  return user.tenantId;
}

export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return user.role === Role.super_admin;
}
