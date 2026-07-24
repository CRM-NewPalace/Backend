/**
 * Verificação das proteções de login: simula os ataques mais comuns e confere
 * se a API responde como esperado.
 *
 * O próprio rate limit da API limita o teste, então o script espera a janela
 * reabrir entre as fases. Leva cerca de 2 minutos.
 *
 * Uso: node scripts/security-check.js
 */
const BASE = process.env.CHECK_BASE_URL ?? 'http://127.0.0.1:3333/api';
const RATE_WINDOW_MS = 61_000;

const post = async (path, body) => {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* resposta sem corpo */
  }
  return { status: res.status, payload, ms: Date.now() - started };
};

const msg = (r) =>
  Array.isArray(r.payload?.message)
    ? r.payload.message.join(', ')
    : (r.payload?.message ?? '(sem corpo)');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASSOU' : 'FALHOU'}  ${name}\n        ${detail}`);
};

(async () => {
  console.log(`Alvo: ${BASE}\n`);

  // --- Fase 1: validação de entrada (2 chamadas) ---
  const grande = await post('/auth/login', {
    email: 'admin@imob.com',
    password: 'A'.repeat(5000),
  });
  check(
    'Payload gigante rejeitado (DoS no bcrypt)',
    grande.status === 400,
    `status ${grande.status}: ${msg(grande)}`,
  );

  const extra = await post('/auth/login', {
    email: 'admin@imob.com',
    password: 'admin',
    role: 'admin',
    isSuperUser: true,
  });
  check(
    'Campos nao previstos rejeitados (mass assignment)',
    extra.status === 400,
    `status ${extra.status}: ${msg(extra)}`,
  );

  // --- Fase 2: sem token e headers (nao consomem o limite do login) ---
  const semToken = await fetch(`${BASE}/users`);
  check(
    'Rota /users exige autenticacao',
    semToken.status === 401,
    `status ${semToken.status}`,
  );

  const health = await fetch(`${BASE}/health`);
  const hsts = health.headers.get('strict-transport-security');
  const noSniff = health.headers.get('x-content-type-options');
  const poweredBy = health.headers.get('x-powered-by');
  check(
    'Headers de seguranca aplicados',
    Boolean(hsts) && noSniff === 'nosniff' && !poweredBy,
    `HSTS=${Boolean(hsts)} nosniff=${noSniff} x-powered-by=${poweredBy ?? 'ausente'}`,
  );

  console.log(`\n... aguardando a janela de rate limit reabrir (60s)\n`);
  await wait(RATE_WINDOW_MS);

  // --- Fase 3: enumeracao de usuarios e timing (4 chamadas) ---
  // Descarta a primeira medicao de cada lado: a inicializacao do pool de
  // conexoes distorce o tempo.
  await post('/auth/login', { email: 'aquecimento@imob.com', password: 'Aquecer123' });
  await post('/auth/login', { email: 'admin@imob.com', password: 'SenhaErrada1' });

  const inexistente = await post('/auth/login', {
    email: 'naoexiste@imob.com',
    password: 'SenhaErrada1',
  });
  const existente = await post('/auth/login', {
    email: 'admin@imob.com',
    password: 'SenhaErrada2',
  });

  check(
    'Nao revela quais e-mails existem',
    inexistente.status === existente.status && msg(inexistente) === msg(existente),
    `inexistente=${inexistente.status} "${msg(inexistente)}" | existente=${existente.status} "${msg(existente)}"`,
  );

  const delta = Math.abs(inexistente.ms - existente.ms);
  check(
    'Tempo de resposta equivalente (sem timing attack)',
    delta < 100,
    `diferenca de ${delta}ms (inexistente ${inexistente.ms}ms vs existente ${existente.ms}ms)`,
  );

  console.log(`\n... aguardando a janela de rate limit reabrir (60s)\n`);
  await wait(RATE_WINDOW_MS);

  // --- Fase 4: forca bruta ---
  let blockedAt = null;
  for (let i = 1; i <= 12 && blockedAt === null; i++) {
    const r = await post('/auth/login', {
      email: 'alvo-bruteforce@imob.com',
      password: `TentativaErrada${i}`,
    });
    if (r.status === 429) blockedAt = i;
  }
  check(
    'Forca bruta cortada pelo rate limit (429)',
    blockedAt !== null && blockedAt <= 8,
    blockedAt ? `bloqueado na tentativa ${blockedAt}` : 'nunca bloqueou em 12 tentativas',
  );

  const falhas = results.filter((r) => !r.passed).length;
  console.log(
    `\n${results.length - falhas}/${results.length} verificacoes passaram.`,
  );
  process.exit(falhas === 0 ? 0 : 1);
})();
