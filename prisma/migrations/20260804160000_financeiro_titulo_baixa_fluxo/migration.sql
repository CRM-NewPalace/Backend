-- AlterTable
ALTER TABLE "financeiro_titulos" ADD COLUMN "dataPagamento" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "financeiro_movimentos" ADD COLUMN "tituloId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_movimentos_tituloId_key" ON "financeiro_movimentos"("tituloId");

-- AddForeignKey
ALTER TABLE "financeiro_movimentos" ADD CONSTRAINT "financeiro_movimentos_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "financeiro_titulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
