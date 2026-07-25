import { CatalogType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class QueryCatalogDto {
  @IsOptional()
  @IsEnum(CatalogType, { message: 'Tipo de catálogo inválido.' })
  type?: CatalogType;

  /** Quando true (padrão), retorna apenas itens ativos. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activeOnly?: boolean;
}
