import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AgendamentoAlvo,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
} from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  decryptSecret,
  encryptSecret,
  googleTokenKey,
} from './google-token.crypto';
import {
  frontendAgendaUrl,
  googleOAuthConfigured,
  parseAllowedRedirectUris,
  pickRedirectUri,
} from './google-oauth.util';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const SCOPES = `openid email ${CALENDAR_SCOPE} ${USERINFO_SCOPE}`;
const TIME_ZONE = 'America/Sao_Paulo';
const STATE_TYP = 'gcal-oauth';

type OAuthState = {
  sub: string;
  redirectUri: string;
  typ: string;
};

export type GoogleSyncAgendamento = {
  id: string;
  autorId: string;
  atribuidoParaId: string | null;
  titulo: string;
  tipo: AgendamentoTipo;
  status: AgendamentoStatus;
  solicitacaoStatus: AgendamentoSolicitacaoStatus;
  alvoTipo: AgendamentoAlvo;
  startsAt: Date;
  endsAt: Date | null;
  local: string | null;
  observacoes: string | null;
  lead?: { nome: string } | null;
};

type TokenSet = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type AccessCache = { token: string; exp: number };

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly accessCache = new Map<string, AccessCache>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  isConfigured() {
    return googleOAuthConfigured(this.config);
  }

  async status(user: AuthenticatedUser) {
    if (!this.isConfigured()) {
      return { configured: false, connected: false, googleEmail: null };
    }
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId: user.id },
      select: { googleEmail: true },
    });
    return {
      configured: true,
      connected: Boolean(row),
      googleEmail: row?.googleEmail ?? null,
    };
  }

  buildAuthorizeUrl(user: AuthenticatedUser, req: Request, returnOrigin?: string) {
    this.assertConfigured();
    const allowed = parseAllowedRedirectUris(this.config);
    const redirectUri = pickRedirectUri(req, allowed, returnOrigin);
    const state = this.jwt.sign(
      { sub: user.id, redirectUri, typ: STATE_TYP } satisfies OAuthState,
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '10m',
      },
    );
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    let redirectUri = parseAllowedRedirectUris(this.config)[0];
    try {
      if (!query.state) {
        return frontendAgendaUrl(redirectUri, 'error');
      }
      const payload = this.jwt.verify<OAuthState>(query.state, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.typ !== STATE_TYP || !payload.sub || !payload.redirectUri) {
        return frontendAgendaUrl(redirectUri, 'error');
      }
      redirectUri = payload.redirectUri;
      if (query.error === 'access_denied') {
        return frontendAgendaUrl(redirectUri, 'denied');
      }
      if (!query.code) {
        return frontendAgendaUrl(redirectUri, 'error');
      }

      const tokens = await this.exchangeCode(query.code, payload.redirectUri);
      if (!tokens.access_token) {
        this.logger.warn(
          `OAuth Google sem access_token: ${tokens.error_description ?? tokens.error}`,
        );
        return frontendAgendaUrl(redirectUri, 'error');
      }
      const refreshToken =
        tokens.refresh_token ??
        (await this.existingRefreshToken(payload.sub));
      if (!refreshToken) {
        this.logger.warn('OAuth Google não devolveu refresh_token.');
        return frontendAgendaUrl(redirectUri, 'error');
      }

      const googleEmail = await this.fetchGoogleEmail(tokens.access_token);
      const key = googleTokenKey(this.config);
      await this.prisma.userGoogleCalendar.upsert({
        where: { userId: payload.sub },
        create: {
          userId: payload.sub,
          googleEmail,
          refreshTokenEnc: encryptSecret(refreshToken, key),
        },
        update: {
          googleEmail,
          refreshTokenEnc: encryptSecret(refreshToken, key),
        },
      });
      this.accessCache.set(payload.sub, {
        token: tokens.access_token,
        exp: Date.now() + (tokens.expires_in ?? 3500) * 1000,
      });
      return frontendAgendaUrl(redirectUri, 'connected');
    } catch (err) {
      this.logger.warn(
        `Callback Google falhou: ${err instanceof Error ? err.message : err}`,
      );
      return frontendAgendaUrl(redirectUri, 'error');
    }
  }

  async disconnect(user: AuthenticatedUser) {
    await this.prisma.userGoogleCalendar.deleteMany({
      where: { userId: user.id },
    });
    this.accessCache.delete(user.id);
    return { ok: true };
  }

  async syncAgendamento(item: GoogleSyncAgendamento) {
    if (!this.shouldPush(item)) {
      if (item.status === AgendamentoStatus.cancelado) {
        await this.removeAgendamento(item.id);
      }
      return;
    }
    const userId = item.atribuidoParaId ?? item.autorId;
    const connection = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId },
    });
    if (!connection) return;

    const accessToken = await this.accessTokenFor(connection);
    if (!accessToken) return;

    const mapping = await this.prisma.userGoogleCalendarEvent.findUnique({
      where: {
        agendamentoId_connectionId: {
          agendamentoId: item.id,
          connectionId: connection.id,
        },
      },
    });

    const body = this.eventBody(item);
    if (mapping) {
      const updated = await this.calendarFetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
        {
          method: 'PATCH',
          accessToken,
          body,
        },
      );
      if (updated.status === 404) {
        await this.prisma.userGoogleCalendarEvent.delete({
          where: { id: mapping.id },
        });
        await this.createGoogleEvent(connection.id, connection.calendarId, item, accessToken, body);
      }
      return;
    }

    await this.createGoogleEvent(
      connection.id,
      connection.calendarId,
      item,
      accessToken,
      body,
    );
  }

  async removeAgendamento(agendamentoId: string) {
    const mappings = await this.prisma.userGoogleCalendarEvent.findMany({
      where: { agendamentoId },
      include: { connection: true },
    });
    for (const mapping of mappings) {
      const accessToken = await this.accessTokenFor(mapping.connection);
      if (accessToken) {
        await this.calendarFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.connection.calendarId)}/events/${encodeURIComponent(mapping.googleEventId)}`,
          { method: 'DELETE', accessToken },
        );
      }
      await this.prisma.userGoogleCalendarEvent.delete({
        where: { id: mapping.id },
      }).catch(() => undefined);
    }
  }

  async removeMany(agendamentoIds: string[]) {
    if (agendamentoIds.length === 0) return;
    for (const id of agendamentoIds) {
      await this.removeAgendamento(id);
    }
  }

  private shouldPush(item: GoogleSyncAgendamento) {
    if (item.tipo === AgendamentoTipo.bloqueio) return false;
    if (item.alvoTipo !== AgendamentoAlvo.nenhum) return false;
    if (item.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente) {
      return false;
    }
    if (item.solicitacaoStatus === AgendamentoSolicitacaoStatus.recusada) {
      return false;
    }
    if (item.status === AgendamentoStatus.cancelado) return false;
    return true;
  }

  private eventBody(item: GoogleSyncAgendamento) {
    const end = item.endsAt
      ? new Date(item.endsAt)
      : new Date(new Date(item.startsAt).getTime() + 60 * 60 * 1000);
    const lines = [
      item.lead?.nome ? `Contato: ${item.lead.nome}` : null,
      item.observacoes?.trim() || null,
      'Criado no CRM Zone Connection',
    ].filter(Boolean);
    return {
      summary: item.titulo,
      description: lines.join('\n'),
      location: item.local?.trim() || undefined,
      start: {
        dateTime: new Date(item.startsAt).toISOString(),
        timeZone: TIME_ZONE,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: TIME_ZONE,
      },
    };
  }

  private async createGoogleEvent(
    connectionId: string,
    calendarId: string,
    item: GoogleSyncAgendamento,
    accessToken: string,
    body: ReturnType<GoogleCalendarService['eventBody']>,
  ) {
    const created = await this.calendarFetch<{ id?: string }>(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', accessToken, body },
    );
    if (!created.ok || !created.json?.id) return;
    await this.prisma.userGoogleCalendarEvent.create({
      data: {
        connectionId,
        agendamentoId: item.id,
        googleEventId: created.json.id,
      },
    });
  }

  private async accessTokenFor(connection: {
    userId: string;
    refreshTokenEnc: string;
  }): Promise<string | null> {
    const cached = this.accessCache.get(connection.userId);
    if (cached && cached.exp - 30_000 > Date.now()) return cached.token;

    const refreshToken = decryptSecret(
      connection.refreshTokenEnc,
      googleTokenKey(this.config),
    );
    const tokens = await this.refreshAccessToken(refreshToken);
    if (!tokens.access_token) {
      if (tokens.error === 'invalid_grant') {
        await this.prisma.userGoogleCalendar.deleteMany({
          where: { userId: connection.userId },
        });
        this.accessCache.delete(connection.userId);
        this.logger.warn(
          `Refresh token Google inválido — conexão removida (${connection.userId}).`,
        );
      }
      return null;
    }
    this.accessCache.set(connection.userId, {
      token: tokens.access_token,
      exp: Date.now() + (tokens.expires_in ?? 3500) * 1000,
    });
    return tokens.access_token;
  }

  private async existingRefreshToken(userId: string): Promise<string | null> {
    const row = await this.prisma.userGoogleCalendar.findUnique({
      where: { userId },
      select: { refreshTokenEnc: true },
    });
    if (!row) return null;
    return decryptSecret(row.refreshTokenEnc, googleTokenKey(this.config));
  }

  private async exchangeCode(code: string, redirectUri: string) {
    return this.postToken({
      code,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }

  private async refreshAccessToken(refreshToken: string) {
    return this.postToken({
      refresh_token: refreshToken,
      client_id: this.clientId(),
      client_secret: this.clientSecret(),
      grant_type: 'refresh_token',
    });
  }

  private async postToken(body: Record<string, string>): Promise<TokenSet> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    return (await response.json()) as TokenSet;
  }

  private async fetchGoogleEmail(accessToken: string): Promise<string> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await response.json()) as { email?: string };
    return json.email?.trim() || 'google';
  }

  private async calendarFetch<T = unknown>(
    url: string,
    opts: { method: string; accessToken: string; body?: unknown },
  ): Promise<{ ok: boolean; status: number; json: T | null }> {
    const response = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (response.status === 204) {
      return { ok: true, status: 204, json: null };
    }
    let json: T | null = null;
    try {
      json = (await response.json()) as T;
    } catch {
      json = null;
    }
    if (!response.ok && response.status !== 404) {
      this.logger.warn(`Google Calendar ${opts.method} ${response.status}`);
    }
    return { ok: response.ok, status: response.status, json };
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Integração Google Calendar não configurada.',
      );
    }
  }

  private clientId() {
    const value = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!value) {
      throw new BadRequestException('GOOGLE_CLIENT_ID ausente.');
    }
    return value;
  }

  private clientSecret() {
    const value = this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim();
    if (!value) {
      throw new BadRequestException('GOOGLE_CLIENT_SECRET ausente.');
    }
    return value;
  }
}
