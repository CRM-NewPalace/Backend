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
  'clientesPerdidos',
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
  'contratos',
  'taxaConversao',
  'configuracoes',
] as const;

/** Módulos do administrativo que entram no toggle em massa (exceto Usuários/Config). */
const ADMINISTRATIVO_TOGGLE = [
  'equipes',
  'corretores',
  'documentacao',
  'analise',
  'metas',
  'propostas',
  'contratos',
  'taxaConversao',
] as const;

const FINANCEIRO = ['financeiro'] as const;

const ALL = [...OPERACIONAL, ...ADMINISTRATIVO, ...FINANCEIRO] as const;

export function isAdminGroupEnabled(
  modules: Record<string, boolean> | null | undefined,
): boolean {
  if (!modules) return false;
  return ADMINISTRATIVO_TOGGLE.every((k) => modules[k] !== false);
}

/**
 * Analista exige módulo de análise/administrativo.
 * Bronze: nunca. Prata/Ouro: só com administrativo ativo.
 */
export function isAnalistaAllowed(
  plano: TenantPlano,
  modules?: Record<string, boolean> | null,
): boolean {
  if (plano === TenantPlano.bronze) return false;
  return isAdminGroupEnabled(modules);
}

/**
 * Normaliza módulos conforme regras do plano:
 * - bronze: só CRM (+ usuários/config); sem financeiro
 * - prata: administrativo XOR financeiro (se ambos, prioriza administrativo)
 * - ouro: sem restrição extra
 */
export function normalizeModulesForPlano(
  plano: TenantPlano,
  modules: Record<string, boolean>,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...modules };

  for (const k of OPERACIONAL) {
    if (typeof next[k] !== 'boolean') next[k] = true;
  }
  next.usuarios = true;
  next.configuracoes = true;

  if (plano === TenantPlano.bronze) {
    for (const k of ADMINISTRATIVO_TOGGLE) next[k] = false;
    next.financeiro = false;
  } else if (plano === TenantPlano.prata) {
    const adminOn = ADMINISTRATIVO_TOGGLE.every((k) => next[k] !== false);
    const financeOn = next.financeiro === true;
    if (adminOn && financeOn) {
      next.financeiro = false;
    } else if (financeOn && !adminOn) {
      for (const k of ADMINISTRATIVO_TOGGLE) next[k] = false;
      next.financeiro = true;
    } else if (adminOn) {
      next.financeiro = false;
    }
  }

  return Object.fromEntries(ALL.map((k) => [k, next[k] === true]));
}

/**
 * Preset de módulos por plano.
 * - bronze: só operacional (+ usuarios/configurações)
 * - prata: operacional + administrativo (sem financeiro por padrão)
 * - ouro: todos os módulos
 */
export function modulesPresetForPlano(
  plano: TenantPlano,
): Record<string, boolean> {
  const enabled = new Set<string>();

  for (const k of OPERACIONAL) enabled.add(k);
  enabled.add('usuarios');
  enabled.add('configuracoes');

  if (plano === TenantPlano.prata || plano === TenantPlano.ouro) {
    for (const k of ADMINISTRATIVO) enabled.add(k);
  }
  if (plano === TenantPlano.ouro) {
    for (const k of FINANCEIRO) enabled.add(k);
  }

  return normalizeModulesForPlano(
    plano,
    Object.fromEntries(ALL.map((k) => [k, enabled.has(k)])),
  );
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
  const modules = normalizeModulesForPlano(
    input.plano,
    input.modules ?? modulesPresetForPlano(input.plano),
  );

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
