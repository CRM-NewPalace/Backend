/**
 * Smoke test anti-XSS: cookies httpOnly + CSRF.
 * Uso: node scripts/xss-cookie-check.js
 */
const BASE = 'http://127.0.0.1:3333/api';

function parseSetCookies(res) {
  // Node 18+ pode expor getSetCookie(); senão usa headers.get('set-cookie').
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  const jar = {};
  for (const raw of list) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed });
  console.log(`${passed ? 'PASSOU' : 'FALHOU'}  ${name}\n        ${detail}`);
};

(async () => {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email: 'admin@imob.com', password: 'admin' }),
  });
  const loginBody = await loginRes.json();
  const jar = parseSetCookies(loginRes);

  check(
    'Login nao devolve JWT no body',
    !loginBody.accessToken && !loginBody.refreshToken && Boolean(loginBody.user?.email),
    `chaves body: ${Object.keys(loginBody).join(', ')}`,
  );

  check(
    'Cookie access httpOnly presente',
    Boolean(jar.crm_access),
    jar.crm_access ? 'crm_access setado' : 'ausente',
  );
  check(
    'Cookie refresh httpOnly presente',
    Boolean(jar.crm_refresh),
    jar.crm_refresh ? 'crm_refresh setado' : 'ausente',
  );
  check(
    'Cookie CSRF (legivel) presente',
    Boolean(jar.crm_csrf),
    jar.crm_csrf ? 'crm_csrf setado' : 'ausente',
  );

  // Confirma Set-Cookie marca HttpOnly nos tokens (nao no CSRF).
  const rawCookies =
    typeof loginRes.headers.getSetCookie === 'function'
      ? loginRes.headers.getSetCookie()
      : [];
  const accessLine = rawCookies.find((c) => c.startsWith('crm_access=')) ?? '';
  const csrfLine = rawCookies.find((c) => c.startsWith('crm_csrf=')) ?? '';
  check(
    'crm_access marcado HttpOnly',
    /httponly/i.test(accessLine),
    accessLine.slice(0, 80) || 'nao encontrado',
  );
  check(
    'crm_csrf NAO e HttpOnly (precisa ser lido pelo JS)',
    csrfLine.length > 0 && !/httponly/i.test(csrfLine),
    csrfLine.slice(0, 80) || 'nao encontrado',
  );

  const meRes = await fetch(`${BASE}/auth/me`, {
    headers: {
      Cookie: cookieHeader(jar),
      Origin: 'http://localhost:5173',
    },
  });
  const meBody = await meRes.json();
  check(
    'GET /auth/me autentica via cookie (sem Bearer)',
    meRes.status === 200 && meBody.email === 'admin@imob.com',
    `status ${meRes.status} email=${meBody.email}`,
  );

  const noCsrf = await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(jar),
      Origin: 'http://localhost:5173',
    },
  });
  check(
    'POST sem CSRF e rejeitado',
    noCsrf.status === 403,
    `status ${noCsrf.status}`,
  );

  const withCsrf = await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader(jar),
      'X-CSRF-Token': jar.crm_csrf,
      Origin: 'http://localhost:5173',
    },
  });
  check(
    'POST com CSRF valido funciona',
    withCsrf.status === 204,
    `status ${withCsrf.status}`,
  );

  const falhas = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - falhas}/${results.length} verificacoes passaram.`);
  process.exit(falhas === 0 ? 0 : 1);
})();
