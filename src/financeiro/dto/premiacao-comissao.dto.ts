import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Premiação avulsa: percentuais sobre o valor total, independentes do rateio da comissão. */
export class PremiacaoComissaoDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Valor da premiação não pode ser negativo.' })
  valorPremiacao?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualPremiacaoCorretor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualPremiacaoImobiliaria?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualPremiacaoGerente?: number;
}
