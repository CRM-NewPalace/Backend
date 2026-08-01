import { Role, UserStatus } from '@prisma/client';
import {
  IsEmail,
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** Atualização de usuário: todos os campos opcionais. A senha é trocada
 * por endpoints dedicados (reset/change password). */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string | null;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsIn([Role.admin, Role.gerente, Role.corretor, Role.analista], {
    message: 'Perfil inválido.',
  })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status inválido.' })
  status?: UserStatus;

  @IsOptional()
  @IsString()
  avatar?: string;
}
