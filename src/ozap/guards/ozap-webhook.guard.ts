import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

function secretsMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Protege a rota pública do webhook contra chamadas que não vêm do OZap. */
@Injectable()
export class OzapWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const secret = this.config.get<string>('OZAP_WEBHOOK_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Integração OZap ainda não foi configurada.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.get('X-Webhook-Secret');
    if (!received || !secretsMatch(received, secret)) {
      throw new UnauthorizedException('Webhook OZap não autorizado.');
    }
    return true;
  }
}
