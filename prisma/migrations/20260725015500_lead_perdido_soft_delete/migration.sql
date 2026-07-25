-- Soft-delete operacional: lead perdido (não apaga o registro).
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "perdidoAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "motivoPerda" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "perdidoPorId" TEXT;

CREATE INDEX IF NOT EXISTS "leads_perdidoAt_idx" ON "leads"("perdidoAt");

DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_perdidoPorId_fkey"
    FOREIGN KEY ("perdidoPorId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
