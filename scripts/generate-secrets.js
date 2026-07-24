/**
 * Gera segredos JWT novos e grava direto no .env, sem imprimir os valores.
 * Uso: node scripts/generate-secrets.js
 */
const { randomBytes } = require('crypto');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

const envPath = join(__dirname, '..', '.env');

if (!existsSync(envPath)) {
  console.error('.env não encontrado. Copie o .env.example primeiro.');
  process.exit(1);
}

const secret = () => randomBytes(48).toString('hex');

const upsert = (content, key, value) => {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(content) ? content.replace(pattern, line) : `${content}\n${line}`;
};

let env = readFileSync(envPath, 'utf8');
env = upsert(env, 'JWT_ACCESS_SECRET', secret());
env = upsert(env, 'JWT_REFRESH_SECRET', secret());
writeFileSync(envPath, env);

console.log('Segredos JWT regenerados no .env (sessões ativas foram invalidadas).');
