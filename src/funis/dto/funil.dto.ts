import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FunilEtapaPapel } from '@prisma/client';

export class CreateFunilEtapaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(FunilEtapaPapel, { message: 'Papel de etapa inválido.' })
  papel?: FunilEtapaPapel | null;
}

export class CreateFunilDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Se true, copia as etapas padrão. Ignorado se `etapas` for enviado. */
  @IsOptional()
  @IsBoolean()
  usarPadrao?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFunilEtapaDto)
  etapas?: CreateFunilEtapaDto[];

  @IsOptional()
  @IsBoolean()
  ativar?: boolean;
}

export class UpdateFunilDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
}

export class UpdateFunilEtapaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** null limpa o papel (etapa intermediária). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(FunilEtapaPapel, { message: 'Papel de etapa inválido.' })
  papel?: FunilEtapaPapel | null;
}

export class ReorderFunilEtapasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
