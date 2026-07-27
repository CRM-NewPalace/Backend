import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { publicUserSelect, PublicUser } from '../common/utils/user-select';
import { SALT_ROUNDS } from '../config/security.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';

export interface PaginatedUsers {
  data: PublicUser[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const email = dto.email.toLowerCase().trim();
    await this.ensureEmailIsAvailable(email);

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        cargo: dto.cargo,
        role: dto.role,
        status: dto.status ?? UserStatus.ativo,
        avatar: dto.avatar,
      },
      select: publicUserSelect,
    });
  }

  async findAll(
    query: QueryUsersDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const teamFilter = await this.teamUserFilter(requester);

    const where: Prisma.UserWhereInput = {
      ...teamFilter,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { cargo: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.ensureCanViewUser(requester, user);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    await this.ensureExists(id);

    const email = dto.email?.toLowerCase().trim();
    if (email) {
      await this.ensureEmailIsAvailable(email, id);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(email ? { email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
        ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      },
      select: publicUserSelect,
    });
  }

  async remove(id: string, requesterId: string): Promise<void> {
    if (id === requesterId) {
      throw new ForbiddenException('Você não pode excluir a própria conta.');
    }
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    requesterId: string,
  ): Promise<PublicUser> {
    if (id === requesterId && status === UserStatus.inativo) {
      throw new ForbiddenException('Você não pode inativar a própria conta.');
    }
    await this.ensureExists(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        status,
        ...(status === UserStatus.inativo
          ? { hashedRefreshToken: null }
          : { failedLoginAttempts: 0, lockedUntil: null }),
      },
      select: publicUserSelect,
    });
  }

  /** Libera manualmente uma conta bloqueada por excesso de tentativas. */
  async unlock(id: string): Promise<PublicUser> {
    await this.ensureExists(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: publicUserSelect,
    });

    await this.prisma.loginAttempt.deleteMany({
      where: { email: user.email, success: false },
    });

    return user;
  }

  /**
   * Admin ou gerente redefine a senha.
   * Retorna a senha temporária gerada (única vez em que ela fica legível).
   */
  async resetPassword(
    id: string,
    password: string | undefined,
    requester: AuthenticatedUser,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect },
    });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.ensureCanResetPassword(requester, target);

    const temporaryPassword = password ? undefined : this.generatePassword();
    const finalPassword = password ?? temporaryPassword!;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(finalPassword, SALT_ROUNDS),
        hashedRefreshToken: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: publicUserSelect,
    });

    return { user, temporaryPassword };
  }

  /** Gerente: só membros da própria equipe (+ ele mesmo). Admin: todos. */
  private async teamUserFilter(
    requester: AuthenticatedUser,
  ): Promise<Prisma.UserWhereInput> {
    if (requester.role === Role.admin) {
      return {};
    }

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }

    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const ids = [...(corretorIds ?? []), requester.id];

    return { id: { in: ids } };
  }

  private async ensureCanViewUser(
    requester: AuthenticatedUser,
    user: PublicUser,
  ): Promise<void> {
    if (requester.role === Role.admin) return;
    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }
    if (user.id === requester.id) return;

    if (user.role !== Role.corretor) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      user.id,
    );
    if (!allowed) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureCanResetPassword(
    requester: AuthenticatedUser,
    user: PublicUser,
  ): Promise<void> {
    if (requester.role === Role.admin) return;

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }

    // Gerente só reseta senha de corretores da própria equipe (não a própria
    // via este endpoint administrativo — usa perfil / change-password).
    if (user.role !== Role.corretor) {
      throw new ForbiddenException(
        'Você só pode redefinir senha de corretores da sua equipe.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      user.id,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você só pode redefinir senha de corretores da sua equipe.',
      );
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id } });
    if (count === 0) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureEmailIsAvailable(
    email: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }
  }

  /** Senha temporária aleatória que atende à política (maiúscula, minúscula e número). */
  private generatePassword(): string {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const all = lower + upper + digits;

    const pick = (set: string) => set[randomInt(set.length)];
    const chars = [pick(lower), pick(upper), pick(digits)];
    for (let i = chars.length; i < 14; i++) {
      chars.push(pick(all));
    }

    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
