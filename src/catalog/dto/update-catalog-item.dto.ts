import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Atualização de item de catálogo. O `type` não muda após criado. */
export class UpdateCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Informe um nome.' })
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
