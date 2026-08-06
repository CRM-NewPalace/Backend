-- A comissão passa a ser um registro financeiro derivado de uma venda.
-- A tabela ainda não possuía vínculos, portanto os registros legados sem
-- documentação não podem ser convertidos com segurança. Falhamos de forma
-- explícita em vez de descartar histórico financeiro silenciosamente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "financeiro_comissoes" LIMIT 1) THEN
    RAISE EXCEPTION
      'Há comissões legadas sem documentacaoId. Vincule/arquive os registros antes desta migração.';
  END IF;
END $$;

TRUNCATE TABLE "financeiro_comissoes";

ALTER TABLE "financeiro_comissoes"
  DROP COLUMN "percentual",
  DROP COLUMN "valor",
  ADD COLUMN "documentacaoId" TEXT NOT NULL,
  ADD COLUMN "corretorId" TEXT NOT NULL,
  ADD COLUMN "gerenteId" TEXT,
  ADD COLUMN "equipeId" TEXT,
  ADD COLUMN "gerente" TEXT NOT NULL DEFAULT '',
  ALTER COLUMN "vgv" TYPE DECIMAL(18,2) USING "vgv"::DECIMAL(18,2),
  ADD COLUMN "percentualImobiliaria" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "comissaoBruta" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "percentualTributos" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "valorTributos" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "comissaoLiquida" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "percentualCorretor" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "valorCorretor" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "percentualGerente" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "valorGerente" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "percentualCaixa" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "valorCaixa" DECIMAL(18,2) NOT NULL,
  ADD COLUMN "percentualSocios" DECIMAL(7,4) NOT NULL,
  ADD COLUMN "valorSocios" DECIMAL(18,2) NOT NULL;

CREATE UNIQUE INDEX "financeiro_comissoes_documentacaoId_key"
  ON "financeiro_comissoes"("documentacaoId");
CREATE INDEX "financeiro_comissoes_corretorId_idx"
  ON "financeiro_comissoes"("corretorId");
CREATE INDEX "financeiro_comissoes_gerenteId_idx"
  ON "financeiro_comissoes"("gerenteId");
CREATE INDEX "financeiro_comissoes_equipeId_idx"
  ON "financeiro_comissoes"("equipeId");

ALTER TABLE "financeiro_comissoes"
  ADD CONSTRAINT "financeiro_comissoes_documentacaoId_fkey"
  FOREIGN KEY ("documentacaoId") REFERENCES "documentacoes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financeiro_comissoes_corretorId_fkey"
  FOREIGN KEY ("corretorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "financeiro_comissoes_gerenteId_fkey"
  FOREIGN KEY ("gerenteId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financeiro_comissoes_equipeId_fkey"
  FOREIGN KEY ("equipeId") REFERENCES "equipes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
