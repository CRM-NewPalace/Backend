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
import { DENSITIES, HOME_PATHS, SIDEBAR_STYLES } from './update-tenant.dto';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Criação de tenant.
 * O admin inicial (e-mail + senha) é gerado automaticamente no service.
 * Branding/layout opcionais podem ser definidos já na criação.
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
  @Transform(emptyToNull)
  @Allow()
  primaryColor?: string | null;

  @IsOptional()
  @IsIn([...SIDEBAR_STYLES], { message: 'sidebarStyle inválido.' })
  sidebarStyle?: (typeof SIDEBAR_STYLES)[number];

  @IsOptional()
  @IsIn([...DENSITIES], { message: 'density inválida.' })
  density?: (typeof DENSITIES)[number];

  @IsOptional()
  @IsIn([...HOME_PATHS], { message: 'homePath inválido.' })
  homePath?: (typeof HOME_PATHS)[number];

  @IsOptional()
  @Allow()
  modules?: Record<string, boolean> | null;
}
