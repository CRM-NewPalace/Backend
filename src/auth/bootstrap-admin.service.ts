import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const SALT_ROUNDS = 12;

/**
 * Garante um super_admin de plataforma no banco a cada subida da API.
 * Credenciais vêm só do ambiente (Render env vars) — não é conta demo de UI.
 */
@Injectable()
export class BootstrapAdminService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.trim();
    const password = this.config.get<string>('BOOTSTRAP_ADMIN_PASSWORD');
    const name =
      this.config.get<string>('BOOTSTRAP_ADMIN_NAME')?.trim() ||
      'Administrador';

    if (!email || !password) {
      this.logger.warn(
        'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD não definidos — super_admin não será criado.',
      );
      return;
    }

    if (password.length < 4) {
      this.logger.error(
        'BOOTSTRAP_ADMIN_PASSWORD muito curta — super_admin ignorado.',
      );
      return;
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const normalizedEmail = email.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId: null },
    });

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          password: hashed,
          role: Role.super_admin,
          status: UserStatus.ativo,
          tenantId: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } else {
      await this.prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          password: hashed,
          role: Role.super_admin,
          status: UserStatus.ativo,
          tenantId: null,
          cargo: 'Super Administrador',
        },
      });
    }

    this.logger.log(`Super admin de plataforma garantido: ${normalizedEmail}`);
  }
}
