import { Prisma } from '@prisma/client';

export type StoredImage = { url: string; publicId: string };

export const EMPREENDIMENTO_MAX_IMAGES = 2;
export const CONSTRUTORA_MAX_IMAGES = 1;

export function parseStoredImages(
  value: Prisma.JsonValue | null | undefined,
): StoredImage[] {
  if (!Array.isArray(value)) return [];
  const out: StoredImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const url = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!url) continue;
    out.push({
      url,
      publicId: typeof rec.publicId === 'string' ? rec.publicId.trim() : '',
    });
  }
  return out;
}

export function serializeStoredImages(
  images: StoredImage[],
): Prisma.InputJsonValue {
  return images.map(({ url, publicId }) => ({ url, publicId }));
}

export function resolveEmpreendimentoImages(row: {
  imagens: Prisma.JsonValue;
  imagemUrl: string | null;
}): StoredImage[] {
  const stored = parseStoredImages(row.imagens);
  if (stored.length > 0) return stored.slice(0, EMPREENDIMENTO_MAX_IMAGES);
  const fallback = row.imagemUrl?.trim();
  return fallback ? [{ url: fallback, publicId: '' }] : [];
}
