import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

const HOME_PATHS = [
  '/dashboard',
  '/funil',
  '/leads',
  '/agenda',
  '/clientes',
  '/imoveis',
] as const;

const SIDEBAR_STYLES = ['default', 'dark', 'compact'] as const;
const DENSITIES = ['comfortable', 'compact'] as const;

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn([UserStatus.ativo, UserStatus.inativo], {
    message: 'Status inválido.',
  })
  status?: UserStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl({ require_tld: false }, { message: 'logoUrl inválida.' })
  @MaxLength(2000)
  logoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor deve ser hex (#RRGGBB).',
  })
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
  @IsObject({ message: 'modules deve ser um objeto.' })
  modules?: Record<string, boolean> | null;
}

export { HOME_PATHS, SIDEBAR_STYLES, DENSITIES };
