import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginFailureReason, Role, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect, PublicUser } from '../common/utils/user-select';
import {
  FAILED_LOGIN_WINDOW_MS,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  PASSWORD_RESET_TTL_MS,
  SALT_ROUNDS,
} from '../config/security.constants';
import { JwtPayload } from './strategies/jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

/** Origem da requisição, usada na trilha de auditoria. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** Mensagem única para qualquer falha de credencial — não revela se o e-mail existe. */
const GENERIC_CREDENTIALS_ERROR = 'Credenciais inválidas.';

/**
 * Hash descartável usado quando o e-mail não existe. Comparar contra ele faz
 * a resposta levar o mesmo tempo de um usuário real, impedindo descobrir
 * contas válidas medindo a latência.
 */
const DUMMY_HASH = bcrypt.hashSync('timing-attack-placeholder', SALT_ROUNDS);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    context: RequestContext = {},
  ): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // O bloqueio é contado por e-mail na trilha de auditoria — vale também
    // para e-mails inexistentes, então a resposta é idêntica nos dois casos
    // e não dá para descobrir quais contas existem.
    if (await this.isTemporarilyLocked(normalizedEmail)) {
      await this.recordAttempt(normalizedEmail, false, context, 'conta_bloqueada');
      throw new ForbiddenException(
        `Muitas tentativas de acesso. Tente novamente em ${Math.round(
          LOCKOUT_DURATION_MS / 60000,
        )} minutos.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Mesmo sem usuário, roda um bcrypt para igualar o tempo de resposta.
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      await this.registerFailure(
        user,
        normalizedEmail,
        context,
        user ? 'senha_incorreta' : 'usuario_inexistente',
      );
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    // A senha confere: só agora é seguro informar que a conta está inativa,
    // porque quem chegou aqui já conhece a credencial.
    if (user.status === UserStatus.inativo) {
      await this.recordAttempt(normalizedEmail, false, context, 'usuario_inativo');
      throw new ForbiddenException(
        'Usuário inativo. Contate o administrador.',
      );
    }

    const tokens = await this.issueTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        hashedRefreshToken: await bcrypt.hash(tokens.refreshToken, SALT_ROUNDS),
      },
    });
    await this.recordAttempt(normalizedEmail, true, context);

    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    if (user.status === UserStatus.inativo) {
      throw new ForbiddenException('Usuário inativo. Contate o administrador.');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );

    if (!tokenMatches) {
      // Token válido na assinatura mas que não é o atual: indício de token
      // roubado ou reaproveitado. Derruba a sessão inteira por precaução.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { hashedRefreshToken: null },
      });
      this.logger.warn(
        `Refresh token reutilizado para o usuário ${user.id}. Sessão encerrada.`,
      );
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    // Rotação: cada refresh emite um par novo e invalida o anterior.
    const tokens = await this.issueTokens(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        hashedRefreshToken: await bcrypt.hash(tokens.refreshToken, SALT_ROUNDS),
      },
    });
    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    if (user.status === UserStatus.inativo) {
      throw new ForbiddenException('Usuário inativo. Contate o administrador.');
    }

    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new UnauthorizedException(
        'A nova senha deve ser diferente da atual.',
      );
    }

    // Trocar a senha derruba as sessões abertas em outros dispositivos.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, SALT_ROUNDS),
        hashedRefreshToken: null,
      },
    });
  }

  /**
   * Gera um token de recuperação de senha. A resposta é sempre a mesma,
   * exista o e-mail ou não, para não expor a base de usuários.
   * Em dev o token volta na resposta; em produção iria por e-mail.
   */
  async forgotPassword(email: string): Promise<{ resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || user.status === UserStatus.inativo) {
      return {};
    }

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return isProd ? {} : { resetToken: rawToken };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() },
      },
    });

    // Comparação em tempo constante evita descobrir o token por latência.
    if (!user || !this.tokensMatch(user.passwordResetToken, hashedToken)) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, SALT_ROUNDS),
        passwordResetToken: null,
        passwordResetExpires: null,
        hashedRefreshToken: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /** Conta as falhas recentes do e-mail, existindo ele ou não. */
  private async isTemporarilyLocked(email: string): Promise<boolean> {
    const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS);
    const failures = await this.prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        reason: { not: 'conta_bloqueada' },
        createdAt: { gte: since },
      },
    });
    return failures >= MAX_FAILED_LOGIN_ATTEMPTS;
  }

  private async registerFailure(
    user: User | null,
    email: string,
    context: RequestContext,
    reason: LoginFailureReason,
  ): Promise<void> {
    await this.recordAttempt(email, false, context, reason);

    if (!user) return;

    const attempts = user.failedLoginAttempts + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil:
          attempts >= MAX_FAILED_LOGIN_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : user.lockedUntil,
      },
    });
  }

  private async recordAttempt(
    email: string,
    success: boolean,
    context: RequestContext,
    reason?: LoginFailureReason,
  ): Promise<void> {
    try {
      await this.prisma.loginAttempt.create({
        data: {
          email,
          success,
          reason,
          ip: context.ip,
          // Trunca para não permitir inflar a tabela via header gigante.
          userAgent: context.userAgent?.slice(0, 255),
        },
      });
    } catch (error) {
      // Auditoria nunca deve derrubar o login.
      this.logger.error('Falha ao registrar tentativa de login', error);
    }
  }

  private tokensMatch(stored: string | null, provided: string): boolean {
    if (!stored) return false;
    const a = Buffer.from(stored);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      name: user.name,
    };

    const accessExpiresIn = this.config.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as unknown as number,
      }),
      this.jwt.signAsync(
        { sub: user.id, email: user.email, role: user.role, name: user.name },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn as unknown as number,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsapp: user.whatsapp,
      cargo: user.cargo,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
