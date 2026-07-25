-- Lead de captação vs cliente da carteira pessoal.
CREATE TYPE "ContatoTipo" AS ENUM ('lead', 'cliente');

ALTER TABLE "leads" ADD COLUMN "tipo" "ContatoTipo" NOT NULL DEFAULT 'lead';

CREATE INDEX "leads_tipo_idx" ON "leads"("tipo");
