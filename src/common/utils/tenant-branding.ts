import { Prisma } from '@prisma/client';

/** Campos de branding/layout expostos ao frontend. */
export const tenantBrandingSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  primaryColor: true,
  sidebarStyle: true,
  density: true,
  homePath: true,
  modules: true,
} satisfies Prisma.TenantSelect;

export type TenantBranding = Prisma.TenantGetPayload<{
  select: typeof tenantBrandingSelect;
}>;

export const tenantAdminSelect = {
  ...tenantBrandingSelect,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantSelect;
