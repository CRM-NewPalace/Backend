import { CatalogType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCatalogItemDto {
  @IsEnum(CatalogType, { message: 'Tipo de catálogo inválido.' })
  type!: CatalogType;

  @IsString()
  @MinLength(1, { message: 'Informe um nome.' })
  @MaxLength(80)
  label!: string;

  /** Só faz sentido para etapas do funil; cor das badges (classes Tailwind). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;
}
