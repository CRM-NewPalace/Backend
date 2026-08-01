import { Allow, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

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

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Update de tenant (branding/layout).
 * Validators leves de propósito: null em logo/cor/modules é comum no JSON do front
 * e já quebrou com IsUrl/ValidateIf + disableErrorMessages em produção.
 * Sanitização fina fica no TenantsService.
 */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  /** Literais — evita IsIn(UserStatus.*) se o enum falhar no bundle. */
  @IsOptional()
  @IsIn(['ativo', 'inativo'], { message: 'Status inválido.' })
  status?: 'ativo' | 'inativo';

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

export { HOME_PATHS, SIDEBAR_STYLES, DENSITIES };
