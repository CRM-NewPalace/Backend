import { CatalogType, PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

/** Espelha Backend/src/catalog/catalog.defaults.ts — mantido inline no seed (ts-node). */
const DEFAULT_FUNNEL_STAGES = [
  { label: 'Novo lead', slug: 'novo', color: 'bg-slate-200 text-slate-700', sortOrder: 0 },
  { label: 'Contato', slug: 'contato', color: 'bg-blue-100 text-blue-700', sortOrder: 1 },
  { label: 'Qualificação', slug: 'qualificacao', color: 'bg-indigo-100 text-indigo-700', sortOrder: 2 },
  { label: 'Em análise', slug: 'em-analise', color: 'bg-violet-100 text-violet-700', sortOrder: 3 },
  { label: 'Visita agendada', slug: 'visita-agendada', color: 'bg-cyan-100 text-cyan-700', sortOrder: 4 },
  { label: 'Visita realizada', slug: 'visita-realizada', color: 'bg-teal-100 text-teal-700', sortOrder: 5 },
  { label: 'Proposta', slug: 'proposta', color: 'bg-amber-100 text-amber-700', sortOrder: 6 },
  { label: 'Negociação', slug: 'negociacao', color: 'bg-orange-100 text-orange-700', sortOrder: 7 },
  { label: 'Contrato / Fechamento', slug: 'contrato-fechamento', color: 'bg-emerald-100 text-emerald-700', sortOrder: 8 },
  { label: 'Ganho / Venda', slug: 'ganho-venda', color: 'bg-green-200 text-green-800', sortOrder: 9 },
  { label: 'Perdido', slug: 'perdido', color: 'bg-red-100 text-red-700', sortOrder: 10 },
] as const;

interface SeedUser {
  name: string;
  email: string;
  password: string;
  phone?: string;
  cargo?: string;
  role: Role;
  status?: UserStatus;
}

const defaultPassword = process.env.SEED_DEFAULT_PASSWORD ?? 'Mudar@123';

const demoAccounts: SeedUser[] = [
  {
    name: 'Ana Souza',
    email: 'admin@imob.com',
    password: 'admin',
    phone: '(11) 99999-0001',
    cargo: 'Diretora',
    role: Role.admin,
  },
  {
    name: 'Carlos Lima',
    email: 'gerente@imob.com',
    password: 'gerente',
    phone: '(11) 99999-0002',
    cargo: 'Gerente comercial',
    role: Role.gerente,
  },
  {
    name: 'Marina Alves',
    email: 'corretor@imob.com',
    password: 'corretor',
    phone: '(11) 99999-0003',
    cargo: 'Corretora sênior',
    role: Role.corretor,
  },
  {
    name: 'Pedro Henrique',
    email: 'pedro@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0004',
    cargo: 'Corretor',
    role: Role.corretor,
  },
  {
    name: 'Sofia Ramos',
    email: 'sofia@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0005',
    cargo: 'Corretora',
    role: Role.corretor,
  },
  {
    name: 'Laura Prado',
    email: 'laura@imob.com',
    password: defaultPassword,
    phone: '(11) 99999-0006',
    cargo: 'Corretora',
    role: Role.corretor,
    status: UserStatus.inativo,
  },
];

async function seedDefaultFunnelStages() {
  for (const stage of DEFAULT_FUNNEL_STAGES) {
    const bySlug = await prisma.catalogItem.findFirst({
      where: { type: CatalogType.funil_etapa, slug: stage.slug },
    });
    if (bySlug) {
      await prisma.catalogItem.update({
        where: { id: bySlug.id },
        data: {
          label: stage.label,
          color: stage.color,
          sortOrder: stage.sortOrder,
          active: true,
        },
      });
      continue;
    }

    const byLabel = await prisma.catalogItem.findUnique({
      where: {
        type_label: { type: CatalogType.funil_etapa, label: stage.label },
      },
    });
    if (byLabel) {
      await prisma.catalogItem.update({
        where: { id: byLabel.id },
        data: {
          slug: stage.slug,
          color: stage.color,
          sortOrder: stage.sortOrder,
          active: true,
        },
      });
      continue;
    }

    await prisma.catalogItem.create({
      data: {
        type: CatalogType.funil_etapa,
        label: stage.label,
        slug: stage.slug,
        color: stage.color,
        sortOrder: stage.sortOrder,
        active: true,
      },
    });
  }
  console.log(`  ✓ ${DEFAULT_FUNNEL_STAGES.length} etapas padrão do funil`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed bloqueado: este script cria contas de demonstração com senhas fracas e não deve rodar em produção.',
    );
  }

  for (const user of demoAccounts) {
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        password: hashed,
        phone: user.phone,
        cargo: user.cargo,
        role: user.role,
        status: user.status ?? UserStatus.ativo,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        name: user.name,
        email: user.email,
        password: hashed,
        phone: user.phone,
        cargo: user.cargo,
        role: user.role,
        status: user.status ?? UserStatus.ativo,
      },
    });
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  // Leads e catálogos operacionais (origens/tags) ficam para a UI.
  // Etapas do funil: pacote padrão instalado no banco.
  await prisma.lead.deleteMany();
  console.log('  ✓ leads removidos');

  await seedDefaultFunnelStages();

  console.log('\nSeed concluído.');
  console.log('Contas demo: admin@imob.com / gerente@imob.com / corretor@imob.com');
  console.log(`Senha padrão (se criar outros usuários via seed): ${defaultPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
