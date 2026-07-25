import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  LEAD_INTERESSES,
  LEAD_PRIORIDADES,
} from '../../leads/lead.constants';

function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

/** Atualização parcial — o vínculo com o lead não muda. */
export class UpdateDocumentacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  origem?: string;

  @IsOptional()
  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Renda inválida.' })
  @Min(0, { message: 'Renda não pode ser negativa.' })
  renda?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean({ message: 'Informe se possui FGTS.' })
  temFgts?: boolean;

  @IsOptional()
  @ValidateIf((o: UpdateDocumentacaoDto) => o.temFgts === true)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor do FGTS inválido.' })
  @Min(0, { message: 'Valor do FGTS não pode ser negativo.' })
  valorFgts?: number | null;

  @IsOptional()
  @IsBoolean({ message: 'Informe se possui entrada.' })
  temEntrada?: boolean;

  @IsOptional()
  @ValidateIf((o: UpdateDocumentacaoDto) => o.temEntrada === true)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor da entrada inválido.' })
  @Min(0, { message: 'Valor da entrada não pode ser negativo.' })
  valorEntrada?: number | null;

  @IsOptional()
  @IsBoolean({ message: 'Informe se possui dependente.' })
  temDependente?: boolean;
}
