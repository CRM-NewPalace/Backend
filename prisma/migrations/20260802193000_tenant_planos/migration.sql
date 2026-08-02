-- Planos comerciais do tenant + cota de usuários + flag bot IA

CREATE TYPE "TenantPlano" AS ENUM ('bronze', 'prata', 'ouro');

ALTER TABLE "tenants" ADD COLUMN "plano" "TenantPlano" NOT NULL DEFAULT 'bronze';
ALTER TABLE "tenants" ADD COLUMN "maxUsuarios" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "tenants" ADD COLUMN "usuariosExtras" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "iaBotEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Tenants já existentes: Ouro para não cortar operação atual
UPDATE "tenants"
SET
  "plano" = 'ouro',
  "maxUsuarios" = 30,
  "usuariosExtras" = 0,
  "iaBotEnabled" = false;
