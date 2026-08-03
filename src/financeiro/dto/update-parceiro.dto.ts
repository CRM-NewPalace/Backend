import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceiroParceiroTipo } from '@prisma/client';

export class UpdateParceiroDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Informe um CPF ou CNPJ válido.' })
  @MaxLength(32)
  documento?: string;

  @IsOptional()
  @IsEnum(FinanceiroParceiroTipo, { message: 'Tipo de parceiro inválido.' })
  tipo?: FinanceiroParceiroTipo;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Saldo aberto inválido.' })
  saldoAberto?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
