import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe uma rota aos perfis informados. Ex.: @Roles(Role.admin). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
