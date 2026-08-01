-- CreateTable
CREATE TABLE "lead_meta_links" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT,
    "adId" TEXT,
    "adgroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_meta_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_meta_links_leadId_key" ON "lead_meta_links"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_meta_links_leadgenId_key" ON "lead_meta_links"("leadgenId");

-- CreateIndex
CREATE INDEX "lead_meta_links_pageId_idx" ON "lead_meta_links"("pageId");

-- CreateIndex
CREATE INDEX "lead_meta_links_formId_idx" ON "lead_meta_links"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "meta_webhook_deliveries_deliveryKey_key" ON "meta_webhook_deliveries"("deliveryKey");

-- CreateIndex
CREATE INDEX "meta_webhook_deliveries_pageId_idx" ON "meta_webhook_deliveries"("pageId");

-- CreateIndex
CREATE INDEX "meta_webhook_deliveries_leadgenId_idx" ON "meta_webhook_deliveries"("leadgenId");

-- AddForeignKey
ALTER TABLE "lead_meta_links" ADD CONSTRAINT "lead_meta_links_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
