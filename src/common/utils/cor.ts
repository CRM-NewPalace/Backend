/** Hex #RRGGBB. String vazia / null → null. */
export function normalizeCor(cor?: string | null): string | null {
  if (cor == null) return null;
  const trimmed = cor.trim();
  return trimmed ? trimmed : null;
}

export const HEX_COR_REGEX = /^#[0-9A-Fa-f]{6}$/;
