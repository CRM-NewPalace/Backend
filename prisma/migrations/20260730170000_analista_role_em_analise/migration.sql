-- AlterEnum Role
ALTER TYPE "Role" ADD VALUE 'analista';

-- AlterEnum AnaliseStatus
ALTER TYPE "AnaliseStatus" ADD VALUE 'em_analise';

-- Lead: construtora / empreendimento
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "construtoraId" TEXT,
  ADD COLUMN IF NOT EXISTS "empreendimentoId" TEXT;

CREATE INDEX IF NOT EXISTS "leads_construtoraId_idx" ON "leads"("construtoraId");
CREATE INDEX IF NOT EXISTS "leads_empreendimentoId_idx" ON "leads"("empreendimentoId");

ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_construtoraId_fkey";
ALTER TABLE "leads" ADD CONSTRAINT "leads_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "construtoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_empreendimentoId_fkey";
ALTER TABLE "leads" ADD CONSTRAINT "leads_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Analise: analistaId
ALTER TABLE "analises" ADD COLUMN IF NOT EXISTS "analistaId" TEXT;

CREATE INDEX IF NOT EXISTS "analises_analistaId_idx" ON "analises"("analistaId");

ALTER TABLE "analises" DROP CONSTRAINT IF EXISTS "analises_analistaId_fkey";
ALTER TABLE "analises" ADD CONSTRAINT "analises_analistaId_fkey" FOREIGN KEY ("analistaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
