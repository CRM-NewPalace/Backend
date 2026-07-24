import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'A senha atual é obrigatória.' })
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  newPassword!: string;
}
