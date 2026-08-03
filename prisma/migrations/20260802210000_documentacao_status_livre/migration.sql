-- Status de documentação passam a ser texto livre.
ALTER TABLE "documentacoes"
  ALTER COLUMN "status1" DROP DEFAULT,
  ALTER COLUMN "status2" DROP DEFAULT;

ALTER TABLE "documentacoes"
  ALTER COLUMN "status1" TYPE TEXT USING (
    CASE "status1"::text
      WHEN 'aprovado' THEN 'Aprovado'
      WHEN 'analise' THEN 'Análise'
      WHEN 'aprovado_restricao' THEN 'Aprovado c/ restrição'
      ELSE "status1"::text
    END
  );

ALTER TABLE "documentacoes"
  ALTER COLUMN "status2" TYPE TEXT USING (
    CASE "status2"::text
      WHEN 'vendido' THEN 'Vendido'
      WHEN 'bacen' THEN 'Bacen'
      WHEN 'andamento' THEN 'Andamento'
      ELSE "status2"::text
    END
  );

ALTER TABLE "documentacoes"
  ALTER COLUMN "status1" SET DEFAULT 'Análise',
  ALTER COLUMN "status2" SET DEFAULT 'Andamento';

DROP TYPE IF EXISTS "DocumentacaoStatus1";
DROP TYPE IF EXISTS "DocumentacaoStatus2";
