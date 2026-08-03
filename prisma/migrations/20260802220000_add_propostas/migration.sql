-- CreateEnum
CREATE TYPE "PropostaStatus" AS ENUM (
  'rascunho',
  'enviada',
  'negociacao',
  'aceita',
  'recusada',
  'expirada'
);

-- CreateTable
CREATE TABLE "propostas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "leadId" TEXT,
  "clienteNome" TEXT NOT NULL,
  "clienteTelefone" TEXT,
  "construtoraId" TEXT,
  "empreendimentoId" TEXT,
  "unidade" TEXT,
  "corretorId" TEXT,
  "autorId" TEXT NOT NULL,
  "valor" INTEGER NOT NULL,
  "entrada" INTEGER,
  "financiamento" INTEGER,
  "status" "PropostaStatus" NOT NULL DEFAULT 'rascunho',
  "validade" TIMESTAMP(3),
  "enviadaEm" TIMESTAMP(3),
  "observacao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "propostas_tenantId_codigo_key" ON "propostas"("tenantId", "codigo");
CREATE INDEX "propostas_tenantId_idx" ON "propostas"("tenantId");
CREATE INDEX "propostas_leadId_idx" ON "propostas"("leadId");
CREATE INDEX "propostas_corretorId_idx" ON "propostas"("corretorId");
CREATE INDEX "propostas_autorId_idx" ON "propostas"("autorId");
CREATE INDEX "propostas_status_idx" ON "propostas"("status");
CREATE INDEX "propostas_createdAt_idx" ON "propostas"("createdAt");

-- AddForeignKey
ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_construtoraId_fkey"
  FOREIGN KEY ("construtoraId") REFERENCES "construtoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_empreendimentoId_fkey"
  FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_corretorId_fkey"
  FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "propostas"
  ADD CONSTRAINT "propostas_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
