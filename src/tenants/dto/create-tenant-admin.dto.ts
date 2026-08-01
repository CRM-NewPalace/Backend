import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

/**
 * Bootstrap de admin em tenant sem usuários.
 * Todos os campos são opcionais — omissa gera e-mail/senha automaticamente.
 */
export class CreateTenantAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password?: string;
}
