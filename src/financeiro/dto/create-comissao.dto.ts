import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceiroComissaoStatus } from '@prisma/client';

export class CreateComissaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  corretor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  equipe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  empreendimento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cliente?: string;

  @IsDateString({}, { message: 'Data de venda inválida.' })
  dataVenda!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'VGV inválido.' })
  vgv!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Percentual inválido.' })
  percentual!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  valor!: number;

  @IsOptional()
  @IsEnum(FinanceiroComissaoStatus)
  status?: FinanceiroComissaoStatus;
}
