-- Esta migration foi criada antes da migration que cria "leads".
-- Em bancos novos, a alteração é aplicada pela migration corretiva posterior.
DO $$ BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    ALTER TABLE "leads"
      DROP COLUMN IF EXISTS "faixa",
      DROP COLUMN IF EXISTS "valor",
      ADD COLUMN IF NOT EXISTS "renda" INTEGER;
  END IF;
END $$;
