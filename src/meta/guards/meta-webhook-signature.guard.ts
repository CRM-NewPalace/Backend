import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Valida a assinatura HMAC-SHA256 do webhook Meta (`X-Hub-Signature-256`).
 * Exige `rawBody` habilitado no bootstrap do Nest.
 */
@Injectable()
export class MetaWebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      throw new ServiceUnavailableException(
        'Integração Meta ainda não foi configurada.',
      );
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const signatureHeader = request.get('X-Hub-Signature-256');
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new UnauthorizedException('Assinatura Meta ausente.');
    }

    const rawBody = request.rawBody;
    if (!rawBody?.length) {
      throw new UnauthorizedException(
        'Corpo bruto da requisição Meta indisponível para validação.',
      );
    }

    const expected = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    const received = signatureHeader.slice('sha256='.length);

    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Assinatura Meta inválida.');
    }

    return true;
  }
}
