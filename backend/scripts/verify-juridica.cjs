/**
 * Activates a JURIDICA account after document review (sets verified = true).
 * Lookup uses the same HMAC as runtime (email.ts). Never pass plaintext email to SQL.
 *
 * Usage (from backend/):
 *   npm run auth:verify-juridica -- coop@example.com
 */
const { createHmac } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

loadDotEnv(resolve(__dirname, '..', '.env'));

const email = normalizeEmail(process.argv[2] ?? '');
if (!email) {
  process.stderr.write('Usage: npm run auth:verify-juridica -- <email>\n');
  process.exit(1);
}

const pepper = process.env.PII_HASH_PEPPER?.trim();
if (!pepper) {
  process.stderr.write('PII_HASH_PEPPER is required\n');
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(1);
}

const emailHash = createHmac('sha256', pepper).update(email).digest('hex');
const prisma = new PrismaClient();

prisma
  .$executeRaw`
    UPDATE users SET verified = true, updated_at = NOW()
    WHERE email_hash = ${emailHash} AND role = 'JURIDICA'::"Role" AND verified = false
  `
  .then((updated) => {
    process.stdout.write(updated > 0 ? 'verified\n' : 'not found\n');
    process.exit(updated > 0 ? 0 : 2);
  })
  .catch(() => {
    process.stderr.write('update failed\n');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

function normalizeEmail(raw) {
  const value = String(raw).trim().toLowerCase();
  if (value.length < 5 || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return null;
  }
  return value;
}

function loadDotEnv(path) {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
