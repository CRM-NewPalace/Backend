import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

/** Admin redefine a senha de um usuário. Se `password` for omitida,
 * o backend gera uma senha temporária forte e a retorna na resposta. */
export class ResetUserPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password?: string;
}
