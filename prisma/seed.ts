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
