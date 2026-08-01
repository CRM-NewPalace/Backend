import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class CreateTenantDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2, { message: 'O slug deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'O slug deve conter apenas letras minúsculas, números e hífens (ex.: minha-imobiliaria).',
  })
  slug!: string;

  @IsOptional()
  @IsIn([UserStatus.ativo, UserStatus.inativo], {
    message: 'Status inválido.',
  })
  status?: UserStatus;

  /** Nome do administrador inicial da imobiliária. */
  @IsString()
  @MinLength(2, { message: 'O nome do admin deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  adminName!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido para o admin.' })
  @MaxLength(255)
  adminEmail!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  adminPassword!: string;
}
