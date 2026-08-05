import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDespesaDto {
  @IsUUID('4', { message: 'Tipo de despesa inválido.' })
  tipoId!: string;

  @IsString()
  @MinLength(2, { message: 'A descrição deve ter ao menos 2 caracteres.' })
  @MaxLength(200)
  descricao!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  @Min(0.01, { message: 'Informe um valor maior que zero.' })
  valor!: number;

  @IsDateString({}, { message: 'Data inválida.' })
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
