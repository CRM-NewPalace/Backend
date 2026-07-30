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

export class UpdateEmpreendimentoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsUUID('4')
  construtoraId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quartos?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banheiros?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaM2?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
