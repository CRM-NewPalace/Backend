-- Branding + layout configurável por tenant

ALTER TABLE "tenants" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "tenants" ADD COLUMN "sidebarStyle" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "tenants" ADD COLUMN "density" TEXT NOT NULL DEFAULT 'comfortable';
ALTER TABLE "tenants" ADD COLUMN "homePath" TEXT NOT NULL DEFAULT '/dashboard';
ALTER TABLE "tenants" ADD COLUMN "modules" JSONB;
