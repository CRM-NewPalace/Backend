import { PrismaClient, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

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

// Contas de demonstração — compatíveis com o botão "Contas demo" do frontend.
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
];

// Equipe adicional (senha padrão = SEED_DEFAULT_PASSWORD).
const teamUsers: SeedUser[] = [
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

interface SeedLead {
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  interesse: string;
  faixa: string;
  cidade: string;
  bairro: string;
  stage: string;
  prioridade: string;
  valor: number;
  tags: string[];
  /** E-mail do corretor dono (para vincular ao User criado acima). */
  corretorEmail: string;
}

// Leads de demonstração distribuídos entre os corretores demo.
const demoLeads: SeedLead[] = [
  {
    nome: 'João Pereira',
    telefone: '(11) 98000-1001',
    email: 'joao.pereira@email.com',
    origem: 'Site',
    interesse: 'Comprar',
    faixa: 'R$ 500k - 800k',
    cidade: 'São Paulo',
    bairro: 'Vila Mariana',
    stage: 'qualificacao',
    prioridade: 'Alta',
    valor: 620000,
    tags: ['Quente'],
    corretorEmail: 'corretor@imob.com',
  },
  {
    nome: 'Beatriz Costa',
    telefone: '(11) 98000-1002',
    email: 'beatriz.costa@email.com',
    origem: 'Indicação',
    interesse: 'Comprar',
    faixa: 'R$ 800k - 1.2M',
    cidade: 'São Paulo',
    bairro: 'Moema',
    stage: 'proposta',
    prioridade: 'Alta',
    valor: 890000,
    tags: ['VIP'],
    corretorEmail: 'pedro@imob.com',
  },
  {
    nome: 'Ricardo Santos',
    telefone: '(11) 98000-1003',
    email: 'ricardo.santos@email.com',
    origem: 'Google Ads',
    interesse: 'Investir',
    faixa: 'R$ 1.2M+',
    cidade: 'São Paulo',
    bairro: 'Itaim Bibi',
    stage: 'visita-agendada',
    prioridade: 'Média',
    valor: 1250000,
    tags: ['Investidor'],
    corretorEmail: 'sofia@imob.com',
  },
  {
    nome: 'Camila Rocha',
    telefone: '(11) 98000-1004',
    email: 'camila.rocha@email.com',
    origem: 'Instagram',
    interesse: 'Alugar',
    faixa: 'R$ 300k - 500k',
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    stage: 'contato',
    prioridade: 'Baixa',
    valor: 450000,
    tags: ['Retorno'],
    corretorEmail: 'corretor@imob.com',
  },
  {
    nome: 'Fernando Lima',
    telefone: '(11) 98000-1005',
    email: 'fernando.lima@email.com',
    origem: 'WhatsApp',
    interesse: 'Comprar',
    faixa: 'R$ 500k - 800k',
    cidade: 'São Paulo',
    bairro: 'Perdizes',
    stage: 'novo',
    prioridade: 'Média',
    valor: 780000,
    tags: [],
    corretorEmail: 'pedro@imob.com',
  },
];

async function main() {
  // As contas demo usam senhas triviais ("admin", "gerente"...) para facilitar
  // o desenvolvimento. Deixá-las em produção seria uma porta aberta.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed bloqueado: este script cria contas de demonstração com senhas fracas e não deve rodar em produção.',
    );
  }

  const users = [...demoAccounts, ...teamUsers];

  for (const user of users) {
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        // Regrava a senha para manter o mesmo custo de bcrypt em todas as
        // contas — custos diferentes criam variação de tempo no login.
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

  // Leads de demonstração — recriados a cada seed para um estado previsível.
  await prisma.lead.deleteMany({
    where: { email: { in: demoLeads.map((l) => l.email) } },
  });

  for (const lead of demoLeads) {
    const corretor = await prisma.user.findUnique({
      where: { email: lead.corretorEmail },
      select: { id: true },
    });

    await prisma.lead.create({
      data: {
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        origem: lead.origem,
        interesse: lead.interesse,
        faixa: lead.faixa,
        cidade: lead.cidade,
        bairro: lead.bairro,
        stage: lead.stage,
        prioridade: lead.prioridade,
        valor: lead.valor,
        tags: lead.tags,
        corretorId: corretor?.id ?? null,
      },
    });
    console.log(`  ✓ lead ${lead.nome} → ${lead.corretorEmail}`);
  }

  console.log('\nSeed concluído.');
  console.log('Contas demo: admin@imob.com / gerente@imob.com / corretor@imob.com');
  console.log(`Demais usuários usam a senha: ${defaultPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
