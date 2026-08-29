import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const CALLBACK_PATH = '/api/integrations/meta/callback';

export function parseMetaAllowedRedirectUris(config: ConfigService): string[] {
  const list = config.get<string>('META_OAUTH_REDIRECT_URIS') ?? '';
  const single = config.get<string>('META_OAUTH_REDIRECT_URI') ?? '';
  const uris = `${list},${single}`
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return [...new Set(uris)];
}

export function metaOAuthConfigured(config: ConfigService): boolean {
  return Boolean(
    config.get<string>('META_APP_ID')?.trim() &&
      config.get<string>('META_APP_SECRET')?.trim() &&
      parseMetaAllowedRedirectUris(config).length > 0,
  );
}

function originFromRequest(req: Request): string | null {
  const headerOrigin = req.get('origin')?.trim();
  if (headerOrigin) return headerOrigin.replace(/\/$/, '');
  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function pickMetaRedirectUri(
  req: Request,
  allowed: string[],
  returnOrigin?: string,
): string {
  if (allowed.length === 0) {
    throw new BadRequestException(
      'META_OAUTH_REDIRECT_URIS não está configurado.',
    );
  }

  const origin = (returnOrigin ?? originFromRequest(req) ?? '')
    .trim()
    .replace(/\/$/, '');
  if (origin) {
    const wanted = `${origin}${CALLBACK_PATH}`;
    const match = allowed.find((uri) => uri === wanted);
    if (match) return match;
  }

  const production = allowed.find(
    (uri) => !uri.includes('localhost') && !uri.includes('127.0.0.1'),
  );
  return production ?? allowed[0];
}

export function frontendMetaOAuthReturnUrl(
  redirectUri: string,
  result: 'select' | 'error' | 'denied',
): string {
  const origin = new URL(redirectUri).origin;
  return `${origin}/configuracoes?secao=conta&item=conexoes&meta=${result}`;
}
