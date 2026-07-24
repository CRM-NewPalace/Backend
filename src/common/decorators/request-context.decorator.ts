import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

/** Extrai IP e user agent da requisição para a trilha de auditoria. */
export const RequestContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return {
      ip: request.ip ?? request.socket?.remoteAddress ?? undefined,
      userAgent: request.get('user-agent') ?? undefined,
    };
  },
);
