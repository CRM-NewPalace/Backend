import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  frontendMetaOAuthReturnUrl,
  metaOAuthConfigured,
  parseMetaAllowedRedirectUris,
} from './meta-oauth.util';

describe('meta-oauth.util', () => {
  it('lê redirects e detecta configuração', () => {
    const config = {
      get: (key: string) => {
        if (key === 'META_APP_ID') return '123';
        if (key === 'META_APP_SECRET') return 'secret-secret-16';
        if (key === 'META_OAUTH_REDIRECT_URIS') {
          return 'http://localhost:8080/api/integrations/meta/callback';
        }
        return undefined;
      },
    } as ConfigService;
    assert.equal(metaOAuthConfigured(config), true);
    assert.deepEqual(parseMetaAllowedRedirectUris(config), [
      'http://localhost:8080/api/integrations/meta/callback',
    ]);
  });

  it('monta URL de retorno com meta=select', () => {
    assert.equal(
      frontendMetaOAuthReturnUrl(
        'http://localhost:8080/api/integrations/meta/callback',
        'select',
      ),
      'http://localhost:8080/configuracoes?secao=conta&item=conexoes&meta=select',
    );
  });
});
