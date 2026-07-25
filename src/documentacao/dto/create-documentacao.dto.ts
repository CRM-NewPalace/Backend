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
  IsUUID,
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

export class CreateDocumentacaoDto {
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId!: string;

  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(60)
  origem!: string;

  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse!: string;

  @IsString()
  @MaxLength(80)
  cidade!: string;

  @IsString()
  @MaxLength(80)
  bairro!: string;

  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade!: string;

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

  @IsBoolean({ message: 'Informe se possui FGTS.' })
  temFgts!: boolean;

  @ValidateIf((o: CreateDocumentacaoDto) => o.temFgts === true)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor do FGTS inválido.' })
  @Min(0, { message: 'Valor do FGTS não pode ser negativo.' })
  valorFgts?: number | null;

  @IsBoolean({ message: 'Informe se possui entrada.' })
  temEntrada!: boolean;

  @ValidateIf((o: CreateDocumentacaoDto) => o.temEntrada === true)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor da entrada inválido.' })
  @Min(0, { message: 'Valor da entrada não pode ser negativo.' })
  valorEntrada?: number | null;

  @IsBoolean({ message: 'Informe se possui dependente.' })
  temDependente!: boolean;
}
