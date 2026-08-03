-- CreateEnum
CREATE TYPE "FunilEtapaPapel" AS ENUM ('inicial', 'analise', 'venda', 'perdido');

-- AlterTable
ALTER TABLE "funil_etapas" ADD COLUMN "papel" "FunilEtapaPapel";

-- CreateIndex
CREATE INDEX "funil_etapas_funilId_papel_idx" ON "funil_etapas"("funilId", "papel");

-- Backfill papéis por slug legado
UPDATE "funil_etapas" SET "papel" = 'inicial' WHERE "slug" = 'novo';
UPDATE "funil_etapas" SET "papel" = 'analise' WHERE "slug" = 'em-analise';
UPDATE "funil_etapas" SET "papel" = 'venda' WHERE "slug" = 'ganho-venda';
UPDATE "funil_etapas" SET "papel" = 'perdido' WHERE "slug" = 'perdido';
