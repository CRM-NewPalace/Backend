/**
 * Etapas padrão do funil de vendas (imobiliário).
 * Persistidas em `funil_etapas` — o slug é o identificador estável usado em Lead.stage.
 * `papel` dispara fluxos (análise, venda, perda) independente do label.
 */
export const DEFAULT_INITIAL_STAGE_SLUG = 'novo';

export type DefaultFunnelPapel = 'inicial' | 'analise' | 'venda' | 'perdido';

export interface DefaultFunnelStage {
  label: string;
  slug: string;
  color: string;
  sortOrder: number;
  papel?: DefaultFunnelPapel;
}

export const DEFAULT_FUNNEL_STAGES: readonly DefaultFunnelStage[] = [
  {
    label: 'Novo lead',
    slug: DEFAULT_INITIAL_STAGE_SLUG,
    color: 'bg-slate-200 text-slate-700',
    sortOrder: 0,
    papel: 'inicial',
  },
  {
    label: 'Contato',
    slug: 'contato',
    color: 'bg-blue-100 text-blue-700',
    sortOrder: 1,
  },
  {
    label: 'Qualificação',
    slug: 'qualificacao',
    color: 'bg-indigo-100 text-indigo-700',
    sortOrder: 2,
  },
  {
    label: 'Em análise',
    slug: 'em-analise',
    color: 'bg-violet-100 text-violet-700',
    sortOrder: 3,
    papel: 'analise',
  },
  {
    label: 'Visita agendada',
    slug: 'visita-agendada',
    color: 'bg-cyan-100 text-cyan-700',
    sortOrder: 4,
  },
  {
    label: 'Visita realizada',
    slug: 'visita-realizada',
    color: 'bg-teal-100 text-teal-700',
    sortOrder: 5,
  },
  {
    label: 'Proposta',
    slug: 'proposta',
    color: 'bg-amber-100 text-amber-700',
    sortOrder: 6,
  },
  {
    label: 'Negociação',
    slug: 'negociacao',
    color: 'bg-orange-100 text-orange-700',
    sortOrder: 7,
  },
  {
    label: 'Contrato / Fechamento',
    slug: 'contrato-fechamento',
    color: 'bg-emerald-100 text-emerald-700',
    sortOrder: 8,
  },
  {
    label: 'Ganho / Venda',
    slug: 'ganho-venda',
    color: 'bg-green-200 text-green-800',
    sortOrder: 9,
    papel: 'venda',
  },
  {
    label: 'Perdido',
    slug: 'perdido',
    color: 'bg-red-100 text-red-700',
    sortOrder: 10,
    papel: 'perdido',
  },
] as const;
