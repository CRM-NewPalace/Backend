import { FunilTipo, Prisma } from '@prisma/client';

/** Desativa apenas o funil ativo do mesmo tenant + tipo (não mexe em outros tipos). */
export function whereDeactivateActiveOfTipo(
  tenantId: string,
  tipo: FunilTipo,
  exceptId?: string,
): Prisma.FunilWhereInput {
  return {
    tenantId,
    tipo,
    ativo: true,
    ...(exceptId ? { NOT: { id: exceptId } } : {}),
  };
}
