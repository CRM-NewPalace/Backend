/**
 * Catálogo embutido no bundle do site (fallback se o parse do JS falhar).
 * Atualizado com base na listagem pública New Palace.
 */
export const FALLBACK_EMPREENDIMENTOS: Array<{
  nome: string;
  endereco?: string;
  cidade?: string;
  quartos?: number;
  banheiros?: number;
  areaM2?: number;
  link: string;
}> = [
  {
    nome: 'Mirante Belvedere',
    endereco: 'R. Antônio Eduardo Amorim, 141 - Imbiribeira, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 1,
    areaM2: 36.5,
    link: '/mirante-belvedere',
  },
  {
    nome: 'Araçá Prime',
    endereco:
      'Rua Engenheiro José Brandão Cavalcante, Imbiribeira, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 1,
    areaM2: 36,
    link: '/araca-prime',
  },
  {
    nome: 'Bosque Recife',
    endereco: 'Av. da Recuperação, Passarinho, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 1,
    areaM2: 36,
    link: '/bosque-recife',
  },
  {
    nome: 'Alameda dos Pássaros',
    endereco:
      '4A Travessa Pereira de Barreto, 80 - Passarinho, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 1,
    areaM2: 36.73,
    link: '/alameda-dos-passaros',
  },
  {
    nome: 'Jaqueira Prime Residence',
    endereco: 'R. Min. Mario Andreaza - Várzea, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 2,
    areaM2: 43.45,
    link: '/jaqueira-prime-residence',
  },
  {
    nome: 'Città José Ruffino Residence',
    endereco: 'Av. Dr. José Rufino, Barro, Recife - PE',
    cidade: 'Recife',
    quartos: 2,
    banheiros: 2,
    areaM2: 46.08,
    link: '/citta-jose-ruffino-residence',
  },
  {
    nome: 'Pontal Maracaipe',
    endereco: 'Av. Nápoles, s/n, Fragoso, Paulista - PE',
    cidade: 'Paulista',
    quartos: 2,
    banheiros: 1,
    areaM2: 42.15,
    link: '/pontal-maracaipe',
  },
  {
    nome: 'Engenho Paulista',
    endereco: 'Rua Canaã Nossa Sra. da Conceição, Paulista - PE',
    cidade: 'Paulista',
    quartos: 2,
    banheiros: 1,
    areaM2: 39.34,
    link: '/engenho-paulista',
  },
  {
    nome: 'Bandeirantes',
    endereco: 'R. Campo de Pouso - Maranguape I, Paulista - PE',
    cidade: 'Paulista',
    quartos: 2,
    banheiros: 1,
    areaM2: 36,
    link: '/bandeirantes',
  },
  {
    nome: 'Torres Marina',
    endereco: 'R. Divinópolis - Nossa Sra. do Ó, Paulista - PE',
    cidade: 'Paulista',
    quartos: 2,
    banheiros: 1,
    areaM2: 36,
    link: '/torres-marina',
  },
];

export type ParsedEmpreendimento = {
  nome: string;
  endereco: string | null;
  cidade: string | null;
  quartos: number | null;
  banheiros: number | null;
  areaM2: number | null;
  link: string;
  externalKey: string;
  externalUrl: string;
};

const SITE_ORIGIN = 'https://www.imobiliarianewpalace.com.br';

function titleCaseCity(city: string): string {
  const raw = city.trim();
  if (!raw) return raw;
  if (raw.includes(' ')) {
    return raw
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function normalizeKey(linkOrName: string): string {
  return linkOrName
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extrai objetos name/location/city/bedrooms/... do bundle minificado. */
export function parseEmpreendimentosFromBundle(
  js: string,
): ParsedEmpreendimento[] {
  const re =
    /name:"((?:\\.|[^"\\])*)",location:"((?:\\.|[^"\\])*)",city:"((?:\\.|[^"\\])*)",bedrooms:(\d+),bathrooms:(\d+),area:(\d+(?:\.\d+)?),link:"((?:\\.|[^"\\])*)"/g;

  const seen = new Set<string>();
  const items: ParsedEmpreendimento[] = [];

  let match: RegExpExecArray | null;
  while ((match = re.exec(js)) !== null) {
    const nome = unescapeJsString(match[1]);
    const endereco = unescapeJsString(match[2]);
    const cidadeRaw = unescapeJsString(match[3]);
    const link = unescapeJsString(match[7]);
    const key = normalizeKey(link || nome);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    items.push({
      nome,
      endereco: endereco || null,
      cidade: cidadeRaw ? titleCaseCity(cidadeRaw) : null,
      quartos: Number(match[4]) || null,
      banheiros: Number(match[5]) || null,
      areaM2: Number(match[6]) || null,
      link,
      externalKey: key,
      externalUrl: link.startsWith('http')
        ? link
        : `${SITE_ORIGIN}${link.startsWith('/') ? '' : '/'}${link}`,
    });
  }

  return items;
}

function unescapeJsString(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

export function fallbackParsed(): ParsedEmpreendimento[] {
  return FALLBACK_EMPREENDIMENTOS.map((item) => ({
    nome: item.nome,
    endereco: item.endereco ?? null,
    cidade: item.cidade ?? null,
    quartos: item.quartos ?? null,
    banheiros: item.banheiros ?? null,
    areaM2: item.areaM2 ?? null,
    link: item.link,
    externalKey: normalizeKey(item.link || item.nome),
    externalUrl: `${SITE_ORIGIN}${item.link}`,
  }));
}

export async function fetchSiteEmpreendimentos(): Promise<{
  items: ParsedEmpreendimento[];
  source: 'bundle' | 'fallback';
  detail?: string;
}> {
  try {
    const homeRes = await fetch(SITE_ORIGIN + '/', {
      headers: { 'User-Agent': 'NP-Connect-CRM/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!homeRes.ok) {
      throw new Error(`Home HTTP ${homeRes.status}`);
    }
    const html = await homeRes.text();
    const scriptMatch = html.match(
      /src="(\/assets\/index-[^"]+\.js)"/,
    );
    if (!scriptMatch) {
      return {
        items: fallbackParsed(),
        source: 'fallback',
        detail: 'Script do site não encontrado no HTML (SPA).',
      };
    }

    const bundleUrl = `${SITE_ORIGIN}${scriptMatch[1]}`;
    const jsRes = await fetch(bundleUrl, {
      headers: { 'User-Agent': 'NP-Connect-CRM/1.0' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!jsRes.ok) {
      throw new Error(`Bundle HTTP ${jsRes.status}`);
    }
    const js = await jsRes.text();
    const parsed = parseEmpreendimentosFromBundle(js);
    if (parsed.length === 0) {
      return {
        items: fallbackParsed(),
        source: 'fallback',
        detail: 'Nenhum empreendimento encontrado no bundle; usando fallback.',
      };
    }
    return { items: parsed, source: 'bundle' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      items: fallbackParsed(),
      source: 'fallback',
      detail: `Falha ao sincronizar do site: ${message}`,
    };
  }
}
