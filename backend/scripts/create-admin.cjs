/**
 * Seeds an ADMIN operator (email/password in Firebase + encrypted email in Postgres).
 * Never expose this as a public HTTP register.
 *
 * Usage (from backend/):
 *   npm run auth:create-admin -- ops@example.com 'a-strong-password'
 */
const { createHmac, randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const PGP_ENCRYPT_OPTIONS = 'cipher-algo=aes256';

loadDotEnv(resolve(__dirname, '..', '.env'));

const email = normalizeEmail(process.argv[2] ?? '');
const password = process.argv[3] ?? '';
if (!email || password.length < 8) {
  process.stderr.write(
    "Usage: npm run auth:create-admin -- <email> '<password>'\n",
  );
  process.exit(1);
}

const pepper = process.env.PII_HASH_PEPPER?.trim();
const encKey = process.env.PII_ENCRYPTION_KEY?.trim();
const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
if (!pepper || !encKey) {
  process.stderr.write('PII_HASH_PEPPER and PII_ENCRYPTION_KEY are required\n');
  process.exit(1);
}
if (!process.env.DATABASE_URL?.trim()) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(1);
}
if (!apiKey) {
  process.stderr.write('FIREBASE_WEB_API_KEY is required\n');
  process.exit(1);
}

const emailHash = createHmac('sha256', pepper).update(email).digest('hex');

signUpFirebase(apiKey, email, password)
  .then(async (localId) => {
    const prisma = new PrismaClient();
    const id = randomUUID();
    try {
      await prisma.$executeRaw`
        INSERT INTO users (
          id, role, email_enc, email_hash, verified, firebase_uid, created_at, updated_at
        )
        VALUES (
          ${id}::uuid,
          'ADMIN'::"Role",
          pgp_sym_encrypt(${email}, ${encKey}, ${PGP_ENCRYPT_OPTIONS}),
          ${emailHash},
          true,
          ${localId},
          NOW(),
          NOW()
        )
      `;
      process.stdout.write('created\n');
    } finally {
      await prisma.$disconnect();
    }
  })
  .catch((err) => {
    const code = err && err.code;
    if (code === 'EMAIL_EXISTS' || code === 'P2002' || code === '23505') {
      process.stderr.write('exists\n');
      process.exit(2);
      return;
    }
    process.stderr.write('create failed\n');
    process.exit(1);
  });

async function signUpFirebase(key, address, secret) {
  const res = await fetch(
    `${IDENTITY_TOOLKIT}/accounts:signUp?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' },
      body: JSON.stringify({
        email: address,
        password: secret,
        returnSecureToken: true,
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    const message =
      json && json.error && json.error.message
        ? String(json.error.message).split(' : ')[0]
        : 'FIREBASE';
    const error = new Error('firebase');
    error.code = message;
    throw error;
  }
  const localId = json.localId;
  const idToken = json.idToken;
  if (!localId) {
    throw new Error('firebase');
  }
  if (idToken) {
    await fetch(`${IDENTITY_TOOLKIT}/accounts:sendOobCode?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' },
      body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken }),
    });
  }
  return localId;
}

function normalizeEmail(raw) {
  const value = String(raw).trim().toLowerCase();
  if (
    value.length < 5 ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
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
