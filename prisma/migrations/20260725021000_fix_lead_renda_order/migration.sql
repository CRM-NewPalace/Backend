-- Garante o schema final quando "leads" é criada depois da migration de renda.
ALTER TABLE "leads"
  DROP COLUMN IF EXISTS "faixa",
  DROP COLUMN IF EXISTS "valor",
  ADD COLUMN IF NOT EXISTS "renda" INTEGER;
