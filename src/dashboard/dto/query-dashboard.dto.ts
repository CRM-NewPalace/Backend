import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryDashboardDto {
  /** Mês calendário (1–12). Omite = mês atual (timezone BR). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  /** Ano calendário. Omite = ano atual (timezone BR). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;

  /** Filtra por origem do lead (valor do catálogo). */
  @IsOptional()
  @IsString()
  origem?: string;
}
