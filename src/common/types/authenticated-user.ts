import { Role } from '@prisma/client';

/** Payload do usuário disponível na request após autenticação JWT. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  /** Null apenas para super_admin (plataforma). */
  tenantId: string | null;
}
