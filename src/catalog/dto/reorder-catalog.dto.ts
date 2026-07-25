import { CatalogType } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsUUID } from 'class-validator';

/** Reordena os itens de um tipo de catálogo (ex.: etapas do funil). */
export class ReorderCatalogDto {
  @IsEnum(CatalogType, { message: 'Tipo de catálogo inválido.' })
  type!: CatalogType;

  /** IDs na nova ordem desejada. */
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe a nova ordem dos itens.' })
  @IsUUID('4', { each: true, message: 'Item inválido.' })
  orderedIds!: string[];
}
