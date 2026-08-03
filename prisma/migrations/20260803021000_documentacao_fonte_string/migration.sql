-- Fonte deixa de ser enum fixo e passa a texto (label)
ALTER TABLE "documentacoes" ALTER COLUMN "fonte" DROP DEFAULT;

ALTER TABLE "documentacoes"
  ALTER COLUMN "fonte" TYPE TEXT USING (
    CASE "fonte"::text
      WHEN 'indicacao' THEN 'Indicação'
      WHEN 'lead_proprio' THEN 'Lead próprio'
      WHEN 'lista' THEN 'Lista'
      WHEN 'campanha' THEN 'Campanha'
      WHEN 'outro' THEN 'Outro'
      ELSE "fonte"::text
    END
  );

ALTER TABLE "documentacoes" ALTER COLUMN "fonte" SET DEFAULT 'Outro';

DROP TYPE IF EXISTS "DocumentacaoFonte";

-- Seed defaults por tenant (somente se o tipo ainda estiver vazio)
INSERT INTO "catalog_items" ("id", "tenantId", "type", "label", "slug", "color", "sortOrder", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t.id, v.type::"CatalogType", v.label, v.slug, v.color, v.sort_order, true, NOW(), NOW()
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('documentacao_fonte', 'Indicação', 'indicacao', 'bg-emerald-100 text-emerald-700', 0),
    ('documentacao_fonte', 'Lead próprio', 'lead-proprio', 'bg-blue-100 text-blue-700', 1),
    ('documentacao_fonte', 'Lista', 'lista', 'bg-indigo-100 text-indigo-700', 2),
    ('documentacao_fonte', 'Campanha', 'campanha', 'bg-amber-100 text-amber-700', 3),
    ('documentacao_fonte', 'Outro', 'outro', 'bg-slate-200 text-slate-700', 4),
    ('documentacao_status1', 'Aprovado', 'aprovado', 'bg-green-100 text-green-700', 0),
    ('documentacao_status1', 'Análise', 'analise', 'bg-violet-100 text-violet-700', 1),
    ('documentacao_status1', 'Aprovado c/ restrição', 'aprovado-c-restricao', 'bg-amber-100 text-amber-700', 2),
    ('documentacao_status2', 'Vendido', 'vendido', 'bg-green-200 text-green-800', 0),
    ('documentacao_status2', 'Bacen', 'bacen', 'bg-sky-100 text-sky-700', 1),
    ('documentacao_status2', 'Andamento', 'andamento', 'bg-orange-100 text-orange-700', 2)
) AS v(type, label, slug, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "catalog_items" c
  WHERE c."tenantId" = t.id AND c."type" = v.type::"CatalogType"
);
