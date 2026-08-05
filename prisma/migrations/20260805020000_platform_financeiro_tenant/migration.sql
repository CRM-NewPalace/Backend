-- Tenant interno da plataforma (financeiro do super_admin).
-- Não é imobiliária cliente — usado só como escopo dos títulos/parceiros da Zone Connection.
INSERT INTO "tenants" (
  "id",
  "name",
  "slug",
  "status",
  "documento",
  "sidebarStyle",
  "density",
  "homePath",
  "plano",
  "maxUsuarios",
  "usuariosExtras",
  "iaBotEnabled",
  "createdAt",
  "updatedAt"
)
VALUES (
  '00000000-0000-4000-8000-000000000000',
  'Zone Connection',
  'zone-connection-platform',
  'ativo',
  '',
  'default',
  'comfortable',
  '/financeiro/contas-a-receber',
  'ouro',
  0,
  0,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
