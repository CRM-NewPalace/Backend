import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PropostaStatus } from '@prisma/client';

function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

function toIntArray({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.trunc(n));
}

export class CreatePropostaDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId?: string | null;

  @IsString()
  @MinLength(2, { message: 'Informe o nome do cliente.' })
  @MaxLength(120)
  clienteNome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  clienteTelefone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unidade?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor de venda inválido.' })
  @Min(0, { message: 'Valor de venda não pode ser negativo.' })
  valor!: number;

  /** Sinal (mesmo campo `entrada` no banco). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Sinal inválido.' })
  @Min(0)
  entrada?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Apartado inválido.' })
  @Min(0)
  apartado?: number | null;

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: 'Pré-chaves deve ser uma lista.' })
  @ArrayMaxSize(40)
  @IsInt({ each: true, message: 'Pré-chaves inválido.' })
  @Min(0, { each: true })
  preChaves?: number[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: 'Pós-chaves deve ser uma lista.' })
  @ArrayMaxSize(40)
  @IsInt({ each: true, message: 'Pós-chaves inválido.' })
  @Min(0, { each: true })
  posChaves?: number[];

  @IsOptional()
  @Transform(toIntArray)
  @IsArray({ message: 'Intercaladas deve ser uma lista.' })
  @ArrayMaxSize(40)
  @IsInt({ each: true, message: 'Intercaladas inválidas.' })
  @Min(0, { each: true })
  intercaladas?: number[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'FGTS inválido.' })
  @Min(0)
  fgts?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Mora Bem inválido.' })
  @Min(0)
  moraBem?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'MCMV inválido.' })
  @Min(0)
  mcmv?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Parcela Caixa inválida.' })
  @Min(0)
  parcelaCaixa?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Financiamento inválido.' })
  @Min(0)
  financiamento?: number | null;

  @IsOptional()
  @IsEnum(PropostaStatus, { message: 'Status inválido.' })
  status?: PropostaStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Validade inválida.' })
  validade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;
}
