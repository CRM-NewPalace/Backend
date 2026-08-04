-- Alvo da meta: corretor, gerente (equipe) ou imobiliária inteira.
CREATE TYPE "MetaEscopo" AS ENUM ('corretor', 'gerente', 'imobiliaria');

-- Administração passa a poder criar metas.
ALTER TYPE "MetaOrigem" ADD VALUE 'admin';

ALTER TABLE "metas"
  ADD COLUMN "escopo" "MetaEscopo" NOT NULL DEFAULT 'corretor',
  ADD COLUMN "gerenteId" TEXT;

-- Remove unicidade antiga (agora cobre escopos com alvo opcional).
DROP INDEX IF EXISTS "metas_corretorId_origem_tipo_periodo_inicio_key";

-- corretorId deixa de ser obrigatório (metas de imobiliária/gerente).
ALTER TABLE "metas" ALTER COLUMN "corretorId" DROP NOT NULL;

ALTER TABLE "metas"
  ADD CONSTRAINT "metas_gerenteId_fkey"
  FOREIGN KEY ("gerenteId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "metas_escopo_idx" ON "metas"("escopo");
CREATE INDEX "metas_gerenteId_inicio_fim_idx" ON "metas"("gerenteId", "inicio", "fim");

-- Unicidade por escopo (índices parciais: NULL não participa do unique clássico).
CREATE UNIQUE INDEX "metas_corretor_unique"
  ON "metas"("corretorId", "origem", "tipo", "periodo", "inicio")
  WHERE "escopo" = 'corretor' AND "corretorId" IS NOT NULL;

CREATE UNIQUE INDEX "metas_gerente_unique"
  ON "metas"("tenantId", "gerenteId", "origem", "tipo", "periodo", "inicio")
  WHERE "escopo" = 'gerente' AND "gerenteId" IS NOT NULL;

CREATE UNIQUE INDEX "metas_imobiliaria_unique"
  ON "metas"("tenantId", "origem", "tipo", "periodo", "inicio")
  WHERE "escopo" = 'imobiliaria';
