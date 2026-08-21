import { Role, TenantPlano } from '@prisma/client';

export const PLANO_MAX_USUARIOS: Record<TenantPlano, number> = {
  [TenantPlano.solo]: 1,
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

/**
 * Recorte fixo do plano Solo: CRM pessoal, fechamento, metas e financeiro enxuto.
 * Telas financeiras específicas são filtradas no frontend (comissao, a receber, a pagar, fluxo).
 */
const SOLO_ENABLED = new Set<string>([
  'dashboard',
  'leads',
  'funil',
  'agenda',
  'imoveis',
  'clientes',
  'construtoras',
  'usuarios',
  'configuracoes',
  'documentacao',
  'propostas',
  'contratos',
  'metas',
  'financeiro',
]);

export function isAdminGroupEnabled(
  modules: Record<string, boolean> | null | undefined,
): boolean {
  if (!modules) return false;
  return ADMINISTRATIVO_TOGGLE.every((k) => modules[k] !== false);
}

/**
 * Analista exige módulo de análise/administrativo.
 * Solo/Bronze: nunca. Prata/Ouro: só com administrativo ativo.
 */
export function isAnalistaAllowed(
  plano: TenantPlano,
  modules?: Record<string, boolean> | null,
): boolean {
  if (plano === TenantPlano.bronze || plano === TenantPlano.solo) return false;
  return isAdminGroupEnabled(modules);
}

/** Gerente é papel de time — não entra no Solo. */
export function isGerenteAllowed(plano: TenantPlano): boolean {
  return plano !== TenantPlano.solo;
}

export function assertRoleAllowedForPlano(
  plano: TenantPlano,
  role: Role,
  modules?: Record<string, boolean> | null,
): string | null {
  if (role === Role.gerente && !isGerenteAllowed(plano)) {
    return 'O plano Solo não inclui o perfil Gerente.';
  }
  if (role === Role.analista && !isAnalistaAllowed(plano, modules)) {
    if (plano === TenantPlano.solo) {
      return 'O plano Solo não inclui o perfil Analista.';
    }
    if (plano === TenantPlano.bronze) {
      return 'O plano Bronze não inclui o perfil Analista.';
    }
    return 'O perfil Analista exige o pacote Administrativo ativo no plano.';
  }
  return null;
}

/**
 * Normaliza módulos conforme regras do plano:
 * - solo: recorte fixo (CRM + fechamento + metas + financeiro)
 * - bronze: só CRM (+ usuários/config); sem financeiro
 * - prata: administrativo XOR financeiro (se ambos, prioriza administrativo)
 * - ouro: sem restrição extra
 */
export function normalizeModulesForPlano(
  plano: TenantPlano,
  modules: Record<string, boolean>,
): Record<string, boolean> {
  if (plano === TenantPlano.solo) {
    return Object.fromEntries(ALL.map((k) => [k, SOLO_ENABLED.has(k)]));
  }

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
 * - solo: recorte do corretor autônomo
 * - bronze: só operacional (+ usuarios/configurações)
 * - prata: operacional + administrativo (sem financeiro por padrão)
 * - ouro: todos os módulos
 */
export function modulesPresetForPlano(
  plano: TenantPlano,
): Record<string, boolean> {
  if (plano === TenantPlano.solo) {
    return normalizeModulesForPlano(plano, {});
  }

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
