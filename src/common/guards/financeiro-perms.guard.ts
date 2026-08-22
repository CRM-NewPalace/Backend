import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../types/authenticated-user';
import {
  canFinanceiroAction,
  type FinanceiroAcao,
} from '../utils/financeiro-perms';

/** Restringe create/edit/delete do perfil financeiro. */
@Injectable()
export class FinanceiroPermsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || user.role !== Role.financeiro) return true;

    const action = actionFromRequest(request);
    if (!canFinanceiroAction(user, action)) {
      throw new ForbiddenException(
        'Você não tem permissão para esta ação no Financeiro.',
      );
    }
    return true;
  }
}

function actionFromRequest(request: Request): FinanceiroAcao {
  const method = request.method.toUpperCase();
  const path = `${request.baseUrl ?? ''}${request.path ?? ''}`;
  if (method === 'GET' || method === 'HEAD') return 'view';
  if (method === 'DELETE') return 'delete';
  if (method === 'PATCH' || method === 'PUT') return 'edit';
  if (method === 'POST' && path.includes('/baixar')) return 'edit';
  if (method === 'POST') return 'create';
  return 'view';
}
