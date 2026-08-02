-- Pool de leads por equipe (admin → equipe → gerente → corretores)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "equipeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_equipeId_fkey'
  ) THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "leads_equipeId_fkey"
      FOREIGN KEY ("equipeId") REFERENCES "equipes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "leads_equipeId_idx" ON "leads"("equipeId");
