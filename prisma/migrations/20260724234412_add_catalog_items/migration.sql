-- CreateEnum
CREATE TYPE "CatalogType" AS ENUM ('funil_etapa', 'origem', 'motivo_perda', 'tag');

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "type" "CatalogType" NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_items_type_sortOrder_idx" ON "catalog_items"("type", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_type_label_key" ON "catalog_items"("type", "label");
