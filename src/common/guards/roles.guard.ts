import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';
import {
  hasAnyUserModule,
  isSensitiveApiWrite,
  modulesForApiPath,
} from '../utils/user-permissions';

/** Autoriza a rota para os perfis de @Roles() ou para quem recebeu o módulo. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException(
        'Sessão inválida para esta operação. Faça login novamente.',
      );
    }

    const userRole = String(user.role);
    const allowed = requiredRoles.some((role) => String(role) === userRole);
    if (allowed) {
      return true;
    }

    const rawPath = `${request.originalUrl ?? request.url ?? ''}`.split('?')[0];
    const moduleOk = hasAnyUserModule(
      user.role,
      user.permissions,
      modulesForApiPath(rawPath),
    );
    // Assistente: o admin libera módulos — permite escrita nas rotas liberadas.
    if (
      moduleOk &&
      (user.role === Role.assistente ||
        !isSensitiveApiWrite(rawPath, request.method))
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Você não tem permissão para acessar este recurso.',
    );
  }
}
