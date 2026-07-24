import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const email = dto.email.toLowerCase().trim();
    await this.ensureEmailIsAvailable(email);

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        phone: dto.phone,
        cargo: dto.cargo,
        role: dto.role,
        status: dto.status ?? UserStatus.ativo,
        avatar: dto.avatar,
      },
      select: publicUserSelect,
    });
  }

  async findAll(query: QueryUsersDto): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
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

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

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
        // Ao inativar, encerra a sessão ativa. Ao reativar, limpa o bloqueio
        // por tentativas falhas para o usuário conseguir entrar de novo.
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

    // O bloqueio também é contado pela trilha de auditoria; sem limpar essas
    // tentativas o usuário continuaria barrado até a janela expirar.
    await this.prisma.loginAttempt.deleteMany({
      where: { email: user.email, success: false },
    });

    return user;
  }

  /** Admin redefine a senha. Retorna a senha temporária quando gerada. */
  async resetPassword(
    id: string,
    password?: string,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    await this.ensureExists(id);

    const temporaryPassword = password ? undefined : this.generatePassword();
    const finalPassword = password ?? temporaryPassword!;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(finalPassword, SALT_ROUNDS),
        // Redefinir a senha encerra as sessões abertas e libera o bloqueio.
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

    // Embaralha (Fisher-Yates) para não deixar os caracteres obrigatórios fixos no início.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
