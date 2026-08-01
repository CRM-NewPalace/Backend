import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

/** Nomes dos cookies de autenticação. */
export const COOKIE = {
  access: 'crm_access',
  refresh: 'crm_refresh',
  /** NÃO é httpOnly — o frontend lê e reenvia no header X-CSRF-Token. */
  csrf: 'crm_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

/** Converte "15m" / "7d" em milissegundos para maxAge do cookie. */
export function parseDurationMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 1);
}

type SameSite = 'lax' | 'none' | 'strict';

/**
 * SameSite dos cookies de sessão.
 *
 * Cross-site (frontend em outro domínio/porta que a API) só funciona com
 * 'none' — com 'lax' o browser não envia o cookie no XHR e toda requisição
 * autenticada volta 401 depois de um login aparentemente bem-sucedido.
 * Use COOKIE_SAMESITE=lax quando frontend e API compartilham a origem.
 */
function resolveSameSite(config: ConfigService, isProd: boolean): SameSite {
  const raw = config.get<string>('COOKIE_SAMESITE')?.trim().toLowerCase();
  if (raw === 'lax' || raw === 'none' || raw === 'strict') return raw;
  return isProd ? 'none' : 'lax';
}

function baseCookieOptions(config: ConfigService): CookieOptions {
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const sameSite = resolveSameSite(config, isProd);
  return {
    httpOnly: true,
    // O browser descarta SameSite=None sem Secure.
    secure: isProd || sameSite === 'none',
    sameSite,
    path: '/api',
    // CHIPS: cookie particionado ajuda em cross-site (Vercel→Render) quando
    // o browser restringe third-party cookies — sem isso o XHR volta 401.
    ...(sameSite === 'none' ? { partitioned: true } : {}),
  };
}

/**
 * Cookie CSRF legível por JS em qualquer rota do frontend.
 * path "/" é obrigatório: document.cookie só expõe cookies cujo path
 * casa com a página atual — com path "/api" a tela /configuracoes
 * nunca consegue ler o token e as mutações falham com 403.
 */
function csrfCookieOptions(config: ConfigService): CookieOptions {
  return {
    ...baseCookieOptions(config),
    httpOnly: false,
    path: '/',
  };
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const accessMs = parseDurationMs(
    config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    15 * 60_000,
  );
  const refreshMs = parseDurationMs(
    config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    7 * 86_400_000,
  );
  const base = baseCookieOptions(config);

  res.cookie(COOKIE.access, tokens.accessToken, {
    ...base,
    maxAge: accessMs,
  });

  res.cookie(COOKIE.refresh, tokens.refreshToken, {
    ...base,
    maxAge: refreshMs,
  });

  // Remove cookie CSRF legado (path /api) para não sobrar token fantasma.
  res.clearCookie(COOKIE.csrf, { ...base, httpOnly: false });

  res.cookie(COOKIE.csrf, tokens.csrfToken, {
    ...csrfCookieOptions(config),
    maxAge: refreshMs,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService): void {
  const base = baseCookieOptions(config);
  res.clearCookie(COOKIE.access, base);
  res.clearCookie(COOKIE.refresh, base);
  // Limpa ambos os paths (legado /api e atual /).
  res.clearCookie(COOKIE.csrf, { ...base, httpOnly: false });
  res.clearCookie(COOKIE.csrf, csrfCookieOptions(config));
  // Cookies antigos sem Partitioned (pré-CHIPS) — limpa o jar clássico também.
  if (base.partitioned) {
    const legacy = { ...base, partitioned: undefined };
    delete (legacy as { partitioned?: boolean }).partitioned;
    res.clearCookie(COOKIE.access, legacy);
    res.clearCookie(COOKIE.refresh, legacy);
    res.clearCookie(COOKIE.csrf, { ...legacy, httpOnly: false });
    res.clearCookie(COOKIE.csrf, { ...csrfCookieOptions(config), partitioned: undefined });
  }
}
