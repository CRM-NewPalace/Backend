/**
 * Validação das variáveis de ambiente no boot.
 * A aplicação não sobe com segredos ausentes, curtos ou com os valores
 * de exemplo — evita ir para produção com chave JWT previsível.
 */

const MIN_SECRET_LENGTH = 32;

const FORBIDDEN_IN_PRODUCTION = [
  'dev-access-secret-newpalace-change-me',
  'dev-refresh-secret-newpalace-change-me',
  'troque-por-um-segredo-forte-de-acesso',
  'troque-por-um-segredo-forte-de-refresh',
];

export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];
  const isProd = config.NODE_ENV === 'production';

  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    if (!config[key]) {
      errors.push(`${key} é obrigatório.`);
    }
  }

  const accessSecret = String(config.JWT_ACCESS_SECRET ?? '');
  const refreshSecret = String(config.JWT_REFRESH_SECRET ?? '');

  for (const [key, secret] of [
    ['JWT_ACCESS_SECRET', accessSecret],
    ['JWT_REFRESH_SECRET', refreshSecret],
  ] as const) {
    if (secret && secret.length < MIN_SECRET_LENGTH) {
      errors.push(
        `${key} deve ter ao menos ${MIN_SECRET_LENGTH} caracteres (atual: ${secret.length}).`,
      );
    }
    if (isProd && FORBIDDEN_IN_PRODUCTION.includes(secret)) {
      errors.push(`${key} está usando o valor de exemplo — gere um segredo novo.`);
    }
  }

  if (accessSecret && accessSecret === refreshSecret) {
    errors.push(
      'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes: com segredos iguais, um access token vale como refresh token.',
    );
  }

  if (isProd && !config.FRONTEND_URL) {
    errors.push('FRONTEND_URL é obrigatório em produção (define o CORS).');
  }

  if (isProd) {
    if (!config.BOOTSTRAP_ADMIN_EMAIL) {
      errors.push(
        'BOOTSTRAP_ADMIN_EMAIL é obrigatório em produção (admin de sistema).',
      );
    }
    if (!config.BOOTSTRAP_ADMIN_PASSWORD) {
      errors.push(
        'BOOTSTRAP_ADMIN_PASSWORD é obrigatório em produção (admin de sistema).',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuração de ambiente inválida:\n  - ${errors.join('\n  - ')}`,
    );
  }

  return config;
}
