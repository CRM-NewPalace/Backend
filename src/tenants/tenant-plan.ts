import { TenantPlano } from '@prisma/client';

export const PLANO_MAX_USUARIOS: Record<TenantPlano, number> = {
  [TenantPlano.bronze]: 5,
  [TenantPlano.prata]: 15,
  [TenantPlano.ouro]: 30,
};

/** Chaves alinhadas ao frontend `tenant-modules.ts`. */
const OPERACIONAL = [
  'dashboard',
  'leads',
  'funil',
  'triagem',
  'agenda',
  'imoveis',
  'clientes',
  'construtoras',
  'leadsPerdidos',
] as const;

const ADMINISTRATIVO = [
  'usuarios',
  'equipes',
  'corretores',
  'documentacao',
  'analise',
  'metas',
  'propostas',
  'taxaConversao',
  'relatorios',
  'configuracoes',
] as const;

const FINANCEIRO = ['financeiro'] as const;

const ALL = [...OPERACIONAL, ...ADMINISTRATIVO, ...FINANCEIRO] as const;

/**
 * Preset de módulos por plano.
 * - bronze: só operacional (+ usuarios para gerir a equipe)
 * - prata: operacional + administrativo (CRM completo)
 * - ouro: todos os módulos
 */
export function modulesPresetForPlano(
  plano: TenantPlano,
): Record<string, boolean> {
  const enabled = new Set<string>();

  for (const k of OPERACIONAL) enabled.add(k);
  // Admin da imobiliária precisa criar usuários em qualquer plano.
  enabled.add('usuarios');

  if (plano === TenantPlano.prata || plano === TenantPlano.ouro) {
    for (const k of ADMINISTRATIVO) enabled.add(k);
  }
  if (plano === TenantPlano.ouro) {
    for (const k of FINANCEIRO) enabled.add(k);
  }

  return Object.fromEntries(ALL.map((k) => [k, enabled.has(k)]));
}

export function resolvePlanoFields(input: {
  plano: TenantPlano;
  maxUsuarios?: number;
  usuariosExtras?: number;
  iaBotEnabled?: boolean;
  modules?: Record<string, boolean> | null;
}) {
  const maxUsuarios =
    input.maxUsuarios ?? PLANO_MAX_USUARIOS[input.plano];
  const usuariosExtras = Math.max(0, input.usuariosExtras ?? 0);
  const iaBotEnabled =
    input.iaBotEnabled ?? input.plano === TenantPlano.ouro;
  const modules =
    input.modules ?? modulesPresetForPlano(input.plano);

  return {
    plano: input.plano,
    maxUsuarios,
    usuariosExtras,
    iaBotEnabled,
    modules,
  };
}

export function effectiveUserLimit(
  maxUsuarios: number,
  usuariosExtras: number,
): number {
  return Math.max(0, maxUsuarios) + Math.max(0, usuariosExtras);
}
