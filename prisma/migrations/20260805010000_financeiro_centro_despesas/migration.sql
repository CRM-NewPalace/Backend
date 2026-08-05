-- CreateEnum
CREATE TYPE "FinanceiroDespesaNatureza" AS ENUM ('fixa', 'variavel');

-- CreateTable
CREATE TABLE "financeiro_despesa_tipos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "natureza" "FinanceiroDespesaNatureza" NOT NULL,
    "orcadoMensal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_despesa_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_despesas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_despesas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financeiro_despesa_tipos_tenantId_idx" ON "financeiro_despesa_tipos"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_despesa_tipos_tenantId_natureza_idx" ON "financeiro_despesa_tipos"("tenantId", "natureza");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_despesa_tipos_tenantId_nome_natureza_key" ON "financeiro_despesa_tipos"("tenantId", "nome", "natureza");

-- CreateIndex
CREATE INDEX "financeiro_despesas_tenantId_idx" ON "financeiro_despesas"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_despesas_tenantId_data_idx" ON "financeiro_despesas"("tenantId", "data");

-- CreateIndex
CREATE INDEX "financeiro_despesas_tipoId_idx" ON "financeiro_despesas"("tipoId");

-- AddForeignKey
ALTER TABLE "financeiro_despesa_tipos" ADD CONSTRAINT "financeiro_despesa_tipos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_despesas" ADD CONSTRAINT "financeiro_despesas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_despesas" ADD CONSTRAINT "financeiro_despesas_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "financeiro_despesa_tipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
