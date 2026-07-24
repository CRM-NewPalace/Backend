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

function baseCookieOptions(config: ConfigService): CookieOptions {
  const isProd = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    // Lax: cookies viajam em XHR same-site (localhost:5173 → :3333) e
    // bloqueiam envio em navegações cross-site de terceiros.
    sameSite: 'lax',
    path: '/api',
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

  // CSRF legível por JS — double-submit cookie pattern.
  res.cookie(COOKIE.csrf, tokens.csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: refreshMs,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService): void {
  const base = baseCookieOptions(config);
  for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.csrf]) {
    res.clearCookie(name, { ...base, httpOnly: name !== COOKIE.csrf });
  }
}
