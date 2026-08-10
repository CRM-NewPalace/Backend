import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreatePlatformFornecedorContratoDto {
  @IsUUID()
  parceiroId!: string;

  @IsString()
  titulo!: string;

  @IsString()
  centro!: string;

  @Type(() => Number)
  @Min(0)
  valorAdesao = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  qtdParcelasAdesao?: number;

  @Type(() => Number)
  @Min(0.01)
  valorMensalidade!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  qtdMensalidades!: number;

  @IsDateString()
  dataInicio!: string;

  @IsDateString()
  vencimento!: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}
