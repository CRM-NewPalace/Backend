import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmpreendimentoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsUUID('4')
  construtoraId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quartos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banheiros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaM2?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUrl?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
