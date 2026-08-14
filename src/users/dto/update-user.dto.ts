import { Role, UserStatus } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  MaxLength,
  ValidateIf,
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
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString({}, { message: 'Data de nascimento inválida.' })
  dataNascimento?: string | null;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(40)
  creci?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Informe a cor no formato #RRGGBB.',
  })
  cor?: string | null;

  @IsOptional()
  @IsIn([Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee], {
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
