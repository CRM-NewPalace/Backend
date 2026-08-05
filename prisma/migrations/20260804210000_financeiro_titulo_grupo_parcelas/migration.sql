-- AlterTable
ALTER TABLE "financeiro_titulos" ADD COLUMN "grupoParcelasId" TEXT;

-- CreateIndex
CREATE INDEX "financeiro_titulos_tenantId_grupoParcelasId_idx" ON "financeiro_titulos"("tenantId", "grupoParcelasId");
