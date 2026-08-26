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

const AUTH_COOKIE_NAMES = [COOKIE.access, COOKIE.refresh, COOKIE.csrf] as const;

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
 * Produção usa proxy same-origin (Vercel /api → API), então o padrão é
 * 'lax' — cookies first-party, sem avisos de third-party no Firefox.
 * Use COOKIE_SAMESITE=none só se o front chamar a API em outro domínio
 * sem proxy (cenário frágil; browsers bloqueiam com frequência).
 */
function resolveSameSite(config: ConfigService): SameSite {
  const raw = config.get<string>('COOKIE_SAMESITE')?.trim().toLowerCase();
  if (raw === 'lax' || raw === 'none' || raw === 'strict') return raw;
  return 'lax';
}

function frontendUsesHttps(config: ConfigService): boolean {
  const raw = config.get<string>('FRONTEND_URL') ?? '';
  return raw.split(',').some((u) => u.trim().startsWith('https://'));
}

/**
 * Secure no cookie do browser (Vercel HTTPS), mesmo se o Nest recebe HTTP
 * do rewrite Vercel → Dokploy.
 *
 * COOKIE_SECURE=true|false sobrescreve. Senão: FRONTEND_URL https, ou
 * NODE_ENV=production, ou SameSite=None.
 */
export function resolveCookieSecure(config: ConfigService): boolean {
  const raw = config.get<string>('COOKIE_SECURE')?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  if (frontendUsesHttps(config)) return true;
  const isProd = config.get<string>('NODE_ENV') === 'production';
  return isProd || resolveSameSite(config) === 'none';
}

function baseCookieOptions(config: ConfigService): CookieOptions {
  const sameSite = resolveSameSite(config);
  return {
    httpOnly: true,
    secure: resolveCookieSecure(config),
    sameSite,
    path: '/api',
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

/**
 * O browser só apaga o cookie se path/secure/sameSite/partitioned baterem.
 * Depois de trocar a API (HTTPS→HTTP, Lax↔None) ficam duplicatas e o
 * Express lê o JWT/CSRF antigo → 401/403.
 */
function clearCookieAllVariants(
  res: Response,
  name: string,
  httpOnly: boolean,
): void {
  const paths = ['/', '/api'] as const;
  const sameSites: SameSite[] = ['lax', 'none', 'strict'];
  for (const path of paths) {
    for (const secure of [true, false]) {
      for (const sameSite of sameSites) {
        const partitionedOpts =
          sameSite === 'none' ? [true, false] : [false];
        for (const partitioned of partitionedOpts) {
          const opts: CookieOptions = {
            httpOnly,
            path,
            secure,
            sameSite,
            maxAge: 0,
            ...(partitioned ? { partitioned: true } : {}),
          };
          res.clearCookie(name, opts);
        }
      }
    }
  }
}

function clearAllAuthCookieVariants(res: Response): void {
  clearCookieAllVariants(res, COOKIE.access, true);
  clearCookieAllVariants(res, COOKIE.refresh, true);
  clearCookieAllVariants(res, COOKIE.csrf, false);
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

  clearAllAuthCookieVariants(res);

  res.cookie(COOKIE.access, tokens.accessToken, {
    ...base,
    maxAge: accessMs,
  });

  res.cookie(COOKIE.refresh, tokens.refreshToken, {
    ...base,
    maxAge: refreshMs,
  });

  res.cookie(COOKIE.csrf, tokens.csrfToken, {
    ...csrfCookieOptions(config),
    maxAge: refreshMs,
  });
}

export function clearAuthCookies(res: Response, _config?: ConfigService): void {
  clearAllAuthCookieVariants(res);
}

export { AUTH_COOKIE_NAMES };
