import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const SALT_ROUNDS = 12;

/**
 * Garante um administrador “de sistema” no banco a cada subida da API.
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
        'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD não definidos — admin de sistema não será criado.',
      );
      return;
    }

    if (password.length < 4) {
      this.logger.error(
        'BOOTSTRAP_ADMIN_PASSWORD muito curta — admin de sistema ignorado.',
      );
      return;
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    await this.prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: {
        name,
        password: hashed,
        role: Role.admin,
        status: UserStatus.ativo,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        name,
        email: email.toLowerCase(),
        password: hashed,
        role: Role.admin,
        status: UserStatus.ativo,
        cargo: 'Administrador',
      },
    });

    this.logger.log(`Admin de sistema garantido: ${email.toLowerCase()}`);
  }
}
