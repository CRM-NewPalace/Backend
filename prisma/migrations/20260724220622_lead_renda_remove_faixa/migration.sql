-- AlterTable
ALTER TABLE "leads" DROP COLUMN "faixa",
DROP COLUMN "valor",
ADD COLUMN "renda" INTEGER;
