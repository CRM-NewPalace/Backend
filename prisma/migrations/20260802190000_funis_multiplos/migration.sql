-- Funis nomeados por tenant + etapas por funil

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "funis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "funis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "funil_etapas" (
    "id" TEXT NOT NULL,
    "funilId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-slate-200 text-slate-700',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "funil_etapas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "funis_tenantId_name_key" ON "funis"("tenantId", "name");
CREATE INDEX "funis_tenantId_ativo_idx" ON "funis"("tenantId", "ativo");
CREATE UNIQUE INDEX "funil_etapas_funilId_slug_key" ON "funil_etapas"("funilId", "slug");
CREATE UNIQUE INDEX "funil_etapas_funilId_label_key" ON "funil_etapas"("funilId", "label");
CREATE INDEX "funil_etapas_funilId_sortOrder_idx" ON "funil_etapas"("funilId", "sortOrder");

ALTER TABLE "funis" ADD CONSTRAINT "funis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "funil_etapas" ADD CONSTRAINT "funil_etapas_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: um "Funil padrão" ativo por tenant, a partir das etapas do catálogo
INSERT INTO "funis" ("id", "tenantId", "name", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Funil padrão', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "funis" f WHERE f."tenantId" = t."id"
);

INSERT INTO "funil_etapas" ("id", "funilId", "label", "slug", "color", "sortOrder", "active", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  f."id",
  c."label",
  COALESCE(NULLIF(c."slug", ''), lower(regexp_replace(c."label", '[^a-zA-Z0-9]+', '-', 'g'))),
  COALESCE(c."color", 'bg-slate-200 text-slate-700'),
  c."sortOrder",
  c."active",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "funis" f
INNER JOIN "catalog_items" c
  ON c."tenantId" = f."tenantId"
 AND c."type" = 'funil_etapa'
WHERE f."name" = 'Funil padrão'
  AND NOT EXISTS (
    SELECT 1 FROM "funil_etapas" e WHERE e."funilId" = f."id"
  );
