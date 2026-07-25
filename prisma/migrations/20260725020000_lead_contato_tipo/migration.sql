-- Lead de captação vs cliente da carteira pessoal.
DO $$ BEGIN
  CREATE TYPE "ContatoTipo" AS ENUM ('lead', 'cliente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tipo" "ContatoTipo" NOT NULL DEFAULT 'lead';

CREATE INDEX IF NOT EXISTS "leads_tipo_idx" ON "leads"("tipo");
