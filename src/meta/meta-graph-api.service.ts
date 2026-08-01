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

@Injectable()
export class MetaGraphApiService {
  private readonly logger = new Logger(MetaGraphApiService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchLead(leadgenId: string): Promise<MetaLeadPayload> {
    const token = this.config.get<string>('META_PAGE_ACCESS_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException(
        'META_PAGE_ACCESS_TOKEN não configurado.',
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
    url.searchParams.set('access_token', token);

    const response = await fetch(url);
    const body = (await response.json()) as MetaLeadPayload & {
      error?: { message?: string; type?: string; code?: number };
    };

    if (!response.ok || body.error) {
      const message =
        body.error?.message ?? `Graph API respondeu ${response.status}`;
      this.logger.error(
        `Falha ao buscar leadgen ${leadgenId}: ${message}`,
      );
      throw new Error(`Meta Graph API: ${message}`);
    }

    return body;
  }
}
