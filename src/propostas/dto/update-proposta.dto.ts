import { Transform } from 'class-transformer';
import {
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

export class UpdatePropostaDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o nome do cliente.' })
  @MaxLength(120)
  clienteNome?: string;

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

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor de venda inválido.' })
  @Min(0, { message: 'Valor de venda não pode ser negativo.' })
  valor?: number;

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
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Pré-chaves inválido.' })
  @Min(0)
  preChaves?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Pós-chaves inválido.' })
  @Min(0)
  posChaves?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Intercaladas inválidas.' })
  @Min(0)
  intercaladas?: number | null;

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
