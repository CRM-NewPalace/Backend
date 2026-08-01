import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CSRF_HEADER } from './common/utils/auth-cookies';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Em produção não expõe stack trace / detalhes internos nos logs de erro.
    logger: ['error', 'warn', 'log'],
    // Necessário para validar X-Hub-Signature-256 do webhook Meta.
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');

  // Headers anti-XSS / clickjacking / MIME sniffing.
  // CSP da API: respostas JSON não executam script — default-src 'none'.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  // Não anunciar que o servidor é Express.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // IP real do cliente quando atrás de proxy/load balancer (rate limit correto).
  app.set('trust proxy', 1);

  app.use(cookieParser());

  // Limita o corpo da requisição: bloqueia DoS por payload gigante.
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Em produção, não devolve detalhes da validação que revelem o schema.
      disableErrorMessages: isProd,
    }),
  );

  const allowedOrigins = config
    .get<string>(
      'FRONTEND_URL',
      'http://localhost:5173,http://localhost:3000,http://localhost:8080',
    )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Em produção: lista FRONTEND_URL + previews *.vercel.app do mesmo time.
  // Em dev: qualquer localhost.
  const corsOrigin = (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowed =
      allowedOrigins.includes(origin) ||
      (!isProd &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ||
      (isProd &&
        (/^https:\/\/frontend(-[a-z0-9]+)?-eduardoalvesdesena\.vercel\.app$/i.test(
          origin,
        ) ||
          origin === 'https://frontend-seven-wine-46.vercel.app'));
    callback(null, allowed);
  };

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', CSRF_HEADER],
    exposedHeaders: [],
    maxAge: 600,
  });

  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3333);
  // Loopback IPv4 por padrão. Em produção (container/PaaS) use HOST=0.0.0.0.
  // Em dev o frontend deve falar via proxy do Vite → 127.0.0.1 (evita atraso IPv6).
  const host = config.get<string>('HOST', '127.0.0.1');

  await app.listen(port, host);
  new Logger('Bootstrap').log(
    `API do NP Connect rodando em http://${host}:${port}/api`,
  );
}

void bootstrap();
