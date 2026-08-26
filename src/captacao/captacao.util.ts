export function pickFirstActiveEtapa<
  T extends { id: string; sortOrder: number; active: boolean },
>(etapas: T[]): T | null {
  const active = etapas
    .filter((e) => e.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return active[0] ?? null;
}

export function toMoneyNumber(
  value: { toNumber?: () => number } | number | string | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

export function moneyEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) < 0.005;
}
