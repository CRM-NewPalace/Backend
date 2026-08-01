import {
  Allow,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Update de tenant: dados, logo e módulos.
 * Cor/layout por tenant foram descontinuados.
 */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['ativo', 'inativo'], { message: 'Status inválido.' })
  status?: 'ativo' | 'inativo';

  @IsOptional()
  @Transform(emptyToNull)
  @Allow()
  logoUrl?: string | null;

  @IsOptional()
  @Allow()
  modules?: Record<string, boolean> | null;
}
