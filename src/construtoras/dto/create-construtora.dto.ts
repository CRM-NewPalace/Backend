import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const HEX_COR = /^#[0-9A-Fa-f]{6}$/;

export class CreateConstrutoraDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(HEX_COR, { message: 'Informe a cor no formato #RRGGBB.' })
  cor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  viabilizadorNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  viabilizadorContato?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Informe uma URL https válida da pasta no Drive.' },
  )
  @MaxLength(500)
  driveFolderUrl?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Localidade inválida.' })
  localidadeIds?: string[];
}
