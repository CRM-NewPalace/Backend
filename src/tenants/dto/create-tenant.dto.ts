import {
  Allow,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserStatus } from '@prisma/client';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Criação de tenant.
 * Admin gerado automaticamente. Logo e módulos são opcionais.
 */
export class CreateTenantDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2, { message: 'O slug deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'O slug deve conter apenas letras minúsculas, números e hífens (ex.: minha-imobiliaria).',
  })
  slug!: string;

  @IsOptional()
  @IsIn([UserStatus.ativo, UserStatus.inativo], {
    message: 'Status inválido.',
  })
  status?: UserStatus;

  @IsOptional()
  @Transform(emptyToNull)
  @Allow()
  logoUrl?: string | null;

  @IsOptional()
  @Allow()
  modules?: Record<string, boolean> | null;
}
