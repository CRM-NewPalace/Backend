import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MetaLeadField = {
  name: string;
  values: string[];
};

export type MetaLeadPayload = {
  id: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: MetaLeadField[];
};

export type MetaLeadgenForm = {
  id: string;
  name?: string;
  status?: string;
};

const GRAPH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

@Injectable()
export class MetaGraphApiService {
  private readonly logger = new Logger(MetaGraphApiService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchLead(
    leadgenId: string,
    pageAccessToken: string,
  ): Promise<MetaLeadPayload> {
    if (!pageAccessToken) {
      throw new ServiceUnavailableException(
        'Page access token Meta não configurado para este tenant.',
      );
    }

    const version =
      this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v22.0';
    const url = new URL(
      `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`,
    );
    url.searchParams.set(
      'fields',
      'created_time,ad_id,form_id,field_data',
    );
    url.searchParams.set('access_token', pageAccessToken);

    this.logger.log(
      `Buscando lead na Graph API leadgen_id=${leadgenId} version=${version}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.error(
        `Falha de rede ao buscar leadgen ${leadgenId}: ${timedOut ? 'timeout' : 'fetch_error'}`,
      );
      throw new Error(
        timedOut
          ? 'Meta Graph API: timeout ao buscar leadgen.'
          : 'Meta Graph API: falha de rede ao buscar leadgen.',
      );
    }

    const body = (await response.json()) as MetaLeadPayload & {
      error?: { message?: string; type?: string; code?: number };
    };

    if (!response.ok || body.error) {
      const code = body.error?.code;
      const message =
        body.error?.message ?? `Graph API respondeu ${response.status}`;
      this.logger.error(
        `Falha ao buscar leadgen ${leadgenId}: status=${response.status} code=${code ?? 'n/a'} message=${message}`,
      );
      throw new Error(`Meta Graph API: ${message}`);
    }

    this.logger.log(
      `Lead encontrado na Meta leadgen_id=${leadgenId} fields=${body.field_data?.length ?? 0}`,
    );
    return body;
  }

  async listLeadgenForms(
    pageId: string,
    pageAccessToken: string,
  ): Promise<MetaLeadgenForm[]> {
    const rows = await this.collectPages<MetaLeadgenForm>(
      `${encodeURIComponent(pageId)}/leadgen_forms`,
      'id,name,status',
      pageAccessToken,
    );
    this.logger.log(
      `Formulários Lead Ads na Página page_id=${pageId} count=${rows.length}`,
    );
    return rows;
  }

  async listFormLeads(
    formId: string,
    pageAccessToken: string,
  ): Promise<MetaLeadPayload[]> {
    const rows = await this.collectPages<MetaLeadPayload>(
      `${encodeURIComponent(formId)}/leads`,
      'id,created_time,ad_id,form_id,field_data',
      pageAccessToken,
    );
    this.logger.log(
      `Leads na Graph API form_id=${formId} count=${rows.length}`,
    );
    return rows;
  }

  private async collectPages<T extends { id?: string }>(
    path: string,
    fields: string,
    pageAccessToken: string,
  ): Promise<T[]> {
    const version =
      this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v22.0';
    const collected: T[] = [];
    let after: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(`https://graph.facebook.com/${version}/${path}`);
      url.searchParams.set('fields', fields);
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('access_token', pageAccessToken);
      if (after) url.searchParams.set('after', after);

      const body = await this.graphGet<{
        data?: T[];
        paging?: { cursors?: { after?: string } };
        error?: { message?: string; code?: number };
      }>(url);

      const batch = body.data ?? [];
      collected.push(...batch);
      const nextAfter = body.paging?.cursors?.after;
      if (!batch.length || !nextAfter || nextAfter === after) break;
      after = nextAfter;
    }

    return collected;
  }

  private async graphGet<T extends {
    error?: { message?: string; code?: number };
  }>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new Error(
        timedOut
          ? 'Meta Graph API: timeout ao listar leads.'
          : 'Meta Graph API: falha de rede ao listar leads.',
      );
    }

    const body = (await response.json()) as T;
    if (!response.ok || body.error) {
      const message =
        body.error?.message ?? `Graph API respondeu ${response.status}`;
      this.logger.error(
        `Falha Graph API status=${response.status} code=${body.error?.code ?? 'n/a'} message=${message}`,
      );
      throw new Error(`Meta Graph API: ${message}`);
    }
    return body;
  }
}
