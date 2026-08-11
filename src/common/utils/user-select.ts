import { Prisma } from '@prisma/client';

/** Campos públicos de usuário retornados pela API (nunca inclui senha/segredos). */
export const publicUserSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  phone: true,
  whatsapp: true,
  dataNascimento: true,
  cargo: true,
  cor: true,
  corAside: true,
  corPrincipal: true,
  corModulo: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
