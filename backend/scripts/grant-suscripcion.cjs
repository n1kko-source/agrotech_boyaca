/**
 * Grants 30 days of listing to a NATURAL / JURIDICA user (ops / demo).
 * Does not write a payment row. Production listing still goes through
 * POST /admin/suscripciones/:userId/pagos.
 *
 * Usage (from backend/):
 *   npm run suscripciones:grant -- <userId>
 */
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');

loadDotEnv(resolve(__dirname, '..', '.env'));

const userId = String(process.argv[2] ?? '').trim();
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    userId,
  )
) {
  process.stderr.write('Usage: npm run suscripciones:grant -- <userId>\n');
  process.exit(1);
}

if (!process.env.DATABASE_URL?.trim()) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(1);
}

const prisma = new PrismaClient();

prisma
  .$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT id::text AS id, role::text AS role
      FROM users
      WHERE id = ${userId}::uuid
    `;
    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user) {
      return 'not found';
    }
    if (user.role === 'ADMIN') {
      return 'admin';
    }
    await tx.$executeRaw`
      INSERT INTO subscriptions (
        user_id,
        current_period_end,
        reminded_expiry_at,
        reminded_grace_at,
        reminded_hidden_at,
        updated_at
      )
      VALUES (
        ${userId}::uuid,
        NOW() + INTERVAL '30 days',
        NULL,
        NULL,
        NULL,
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        current_period_end =
          GREATEST(subscriptions.current_period_end, NOW()) + INTERVAL '30 days',
        reminded_expiry_at = NULL,
        reminded_grace_at = NULL,
        reminded_hidden_at = NULL,
        updated_at = NOW()
    `;
    return 'granted';
  })
  .then((result) => {
    if (result === 'granted') {
      process.stdout.write('granted\n');
      process.exit(0);
    }
    if (result === 'admin') {
      process.stderr.write('ADMIN cannot be subscribed\n');
      process.exit(1);
    }
    process.stderr.write('not found\n');
    process.exit(2);
  })
  .catch(() => {
    process.stderr.write('grant failed\n');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

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
