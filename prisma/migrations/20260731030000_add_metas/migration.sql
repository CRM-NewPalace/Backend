CREATE TYPE "MetaOrigem" AS ENUM ('pessoal', 'gerente');
CREATE TYPE "MetaTipo" AS ENUM ('vendas', 'documentacoes', 'vgv');
CREATE TYPE "MetaPeriodo" AS ENUM ('diaria', 'semanal', 'mensal');

CREATE TABLE "metas" (
  "id" TEXT NOT NULL,
  "corretorId" TEXT NOT NULL,
  "criadorId" TEXT NOT NULL,
  "origem" "MetaOrigem" NOT NULL,
  "tipo" "MetaTipo" NOT NULL,
  "periodo" "MetaPeriodo" NOT NULL,
  "valor" INTEGER NOT NULL,
  "inicio" TIMESTAMP(3) NOT NULL,
  "fim" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metas_corretorId_origem_tipo_periodo_inicio_key"
  ON "metas"("corretorId", "origem", "tipo", "periodo", "inicio");
CREATE INDEX "metas_corretorId_inicio_fim_idx"
  ON "metas"("corretorId", "inicio", "fim");
CREATE INDEX "metas_criadorId_idx" ON "metas"("criadorId");

ALTER TABLE "metas"
  ADD CONSTRAINT "metas_corretorId_fkey"
  FOREIGN KEY ("corretorId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metas"
  ADD CONSTRAINT "metas_criadorId_fkey"
  FOREIGN KEY ("criadorId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
