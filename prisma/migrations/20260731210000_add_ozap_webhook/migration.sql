CREATE TABLE "lead_ozap_links" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "instanceId" INTEGER NOT NULL,
  "chatId" TEXT NOT NULL,
  "categoria" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lead_ozap_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ozap_webhook_deliveries" (
  "id" TEXT NOT NULL,
  "deliveryKey" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "instanceId" INTEGER NOT NULL,
  "chatId" TEXT,
  "messageId" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ozap_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_ozap_links_leadId_key" ON "lead_ozap_links"("leadId");
CREATE UNIQUE INDEX "lead_ozap_links_instanceId_chatId_key" ON "lead_ozap_links"("instanceId", "chatId");
CREATE INDEX "lead_ozap_links_instanceId_idx" ON "lead_ozap_links"("instanceId");
CREATE UNIQUE INDEX "ozap_webhook_deliveries_deliveryKey_key" ON "ozap_webhook_deliveries"("deliveryKey");
CREATE INDEX "ozap_webhook_deliveries_instanceId_event_idx" ON "ozap_webhook_deliveries"("instanceId", "event");

ALTER TABLE "lead_ozap_links"
  ADD CONSTRAINT "lead_ozap_links_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
