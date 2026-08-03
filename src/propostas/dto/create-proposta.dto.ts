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
  @IsInt({ message: 'Valor inválido.' })
  @Min(0, { message: 'Valor não pode ser negativo.' })
  valor!: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Entrada inválida.' })
  @Min(0)
  entrada?: number | null;

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
