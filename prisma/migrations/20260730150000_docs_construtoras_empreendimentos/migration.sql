-- CreateEnum
CREATE TYPE "DocumentacaoFonte" AS ENUM ('indicacao', 'lead_proprio', 'lista', 'campanha', 'outro');

-- CreateEnum
CREATE TYPE "DocumentacaoStatus1" AS ENUM ('aprovado', 'analise', 'aprovado_restricao');

-- CreateEnum
CREATE TYPE "DocumentacaoStatus2" AS ENUM ('vendido', 'bacen', 'andamento');

-- CreateTable
CREATE TABLE "construtoras" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "endereco" TEXT,
    "viabilizadorNome" TEXT,
    "viabilizadorContato" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construtoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empreendimentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "construtoraId" TEXT,
    "cidade" TEXT,
    "endereco" TEXT,
    "quartos" INTEGER,
    "banheiros" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "externalUrl" TEXT,
    "externalKey" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empreendimentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "construtoras_nome_idx" ON "construtoras"("nome");
CREATE UNIQUE INDEX "empreendimentos_externalKey_key" ON "empreendimentos"("externalKey");
CREATE INDEX "empreendimentos_construtoraId_idx" ON "empreendimentos"("construtoraId");
CREATE INDEX "empreendimentos_ativo_idx" ON "empreendimentos"("ativo");
CREATE INDEX "empreendimentos_nome_idx" ON "empreendimentos"("nome");

ALTER TABLE "empreendimentos" ADD CONSTRAINT "empreendimentos_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "construtoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reformular documentacoes: remove campos antigos, adiciona planilha
ALTER TABLE "documentacoes"
  DROP COLUMN IF EXISTS "telefone",
  DROP COLUMN IF EXISTS "email",
  DROP COLUMN IF EXISTS "origem",
  DROP COLUMN IF EXISTS "interesse",
  DROP COLUMN IF EXISTS "cidade",
  DROP COLUMN IF EXISTS "bairro",
  DROP COLUMN IF EXISTS "prioridade",
  DROP COLUMN IF EXISTS "renda",
  DROP COLUMN IF EXISTS "tags",
  DROP COLUMN IF EXISTS "temFgts",
  DROP COLUMN IF EXISTS "valorFgts",
  DROP COLUMN IF EXISTS "temEntrada",
  DROP COLUMN IF EXISTS "valorEntrada",
  DROP COLUMN IF EXISTS "temDependente";

ALTER TABLE "documentacoes"
  ADD COLUMN "construtoraId" TEXT,
  ADD COLUMN "empreendimentoId" TEXT,
  ADD COLUMN "fonte" "DocumentacaoFonte" NOT NULL DEFAULT 'outro',
  ADD COLUMN "status1" "DocumentacaoStatus1" NOT NULL DEFAULT 'analise',
  ADD COLUMN "status2" "DocumentacaoStatus2" NOT NULL DEFAULT 'andamento',
  ADD COLUMN "corretorId" TEXT,
  ADD COLUMN "gerenteId" TEXT,
  ADD COLUMN "dataAnalise" TIMESTAMP(3),
  ADD COLUMN "dataVenda" TIMESTAMP(3),
  ADD COLUMN "vgv" INTEGER,
  ADD COLUMN "obs" TEXT;

CREATE INDEX "documentacoes_construtoraId_idx" ON "documentacoes"("construtoraId");
CREATE INDEX "documentacoes_empreendimentoId_idx" ON "documentacoes"("empreendimentoId");
CREATE INDEX "documentacoes_corretorId_idx" ON "documentacoes"("corretorId");
CREATE INDEX "documentacoes_gerenteId_idx" ON "documentacoes"("gerenteId");

ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_construtoraId_fkey" FOREIGN KEY ("construtoraId") REFERENCES "construtoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_gerenteId_fkey" FOREIGN KEY ("gerenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
