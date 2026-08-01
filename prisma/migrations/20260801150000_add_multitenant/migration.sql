-- Multitenant: Tenant + tenantId nas tabelas de negócio + conexões Meta/OZap

-- 1) Enum Role: super_admin
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) Tabela tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- Tenant default (New Palace) — UUID fixo para backfill
INSERT INTO "tenants" ("id", "name", "slug", "status", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'New Palace',
  'new-palace',
  'ativo',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- 3) Conexões Meta / OZap
CREATE TABLE "tenant_meta_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageAccessToken" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_meta_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_meta_connections_pageId_key" ON "tenant_meta_connections"("pageId");
CREATE INDEX "tenant_meta_connections_tenantId_idx" ON "tenant_meta_connections"("tenantId");

ALTER TABLE "tenant_meta_connections"
  ADD CONSTRAINT "tenant_meta_connections_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tenant_ozap_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_ozap_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_ozap_connections_instanceId_key" ON "tenant_ozap_connections"("instanceId");
CREATE INDEX "tenant_ozap_connections_tenantId_idx" ON "tenant_ozap_connections"("tenantId");

ALTER TABLE "tenant_ozap_connections"
  ADD CONSTRAINT "tenant_ozap_connections_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Colunas tenantId (nullable primeiro para backfill)
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "equipes" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "leads" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "construtoras" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "empreendimentos" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "catalog_items" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "documentacoes" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "analises" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "notificacoes" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "metas" ADD COLUMN "tenantId" TEXT;

-- 5) Backfill para New Palace
UPDATE "users" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "equipes" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "leads" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "construtoras" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "empreendimentos" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "catalog_items" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "documentacoes" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "analises" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "agendamentos" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "notificacoes" SET "tenantId" = '00000000-0000-4000-8000-000000000001';
UPDATE "metas" SET "tenantId" = '00000000-0000-4000-8000-000000000001';

-- 6) NOT NULL nas tabelas de negócio (users fica nullable para super_admin)
ALTER TABLE "equipes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "construtoras" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "empreendimentos" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "catalog_items" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "documentacoes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "analises" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "agendamentos" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "notificacoes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "metas" ALTER COLUMN "tenantId" SET NOT NULL;

-- 7) FKs
ALTER TABLE "users"
  ADD CONSTRAINT "users_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipes"
  ADD CONSTRAINT "equipes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "construtoras"
  ADD CONSTRAINT "construtoras_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "empreendimentos"
  ADD CONSTRAINT "empreendimentos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documentacoes"
  ADD CONSTRAINT "documentacoes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analises"
  ADD CONSTRAINT "analises_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notificacoes"
  ADD CONSTRAINT "notificacoes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "metas"
  ADD CONSTRAINT "metas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) Unique constraints: users email por tenant
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");
-- super_admin (tenantId null): e-mail único global
CREATE UNIQUE INDEX "users_super_admin_email_key" ON "users"("email") WHERE "tenantId" IS NULL;

-- catalog: unique por tenant
DROP INDEX IF EXISTS "catalog_items_type_label_key";
CREATE UNIQUE INDEX "catalog_items_tenantId_type_label_key" ON "catalog_items"("tenantId", "type", "label");

-- empreendimentos: externalKey por tenant
DROP INDEX IF EXISTS "empreendimentos_externalKey_key";
CREATE UNIQUE INDEX "empreendimentos_tenantId_externalKey_key" ON "empreendimentos"("tenantId", "externalKey");

-- 9) Índices auxiliares
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");
CREATE INDEX "equipes_tenantId_idx" ON "equipes"("tenantId");
CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
CREATE INDEX "leads_tenantId_tipo_idx" ON "leads"("tenantId", "tipo");
CREATE INDEX "leads_tenantId_stage_idx" ON "leads"("tenantId", "stage");
CREATE INDEX "construtoras_tenantId_idx" ON "construtoras"("tenantId");
CREATE INDEX "empreendimentos_tenantId_idx" ON "empreendimentos"("tenantId");
CREATE INDEX "catalog_items_tenantId_idx" ON "catalog_items"("tenantId");
CREATE INDEX "documentacoes_tenantId_idx" ON "documentacoes"("tenantId");
CREATE INDEX "analises_tenantId_idx" ON "analises"("tenantId");
CREATE INDEX "agendamentos_tenantId_idx" ON "agendamentos"("tenantId");
CREATE INDEX "notificacoes_tenantId_idx" ON "notificacoes"("tenantId");
CREATE INDEX "metas_tenantId_idx" ON "metas"("tenantId");
