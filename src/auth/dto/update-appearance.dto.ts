import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { HEX_COR_REGEX } from '../../common/utils/cor';

export class UpdateAppearanceDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor do aside no formato #RRGGBB.',
  })
  corAside?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor principal no formato #RRGGBB.',
  })
  corPrincipal?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor lateral dos módulos no formato #RRGGBB.',
  })
  corModulo?: string | null;
}
