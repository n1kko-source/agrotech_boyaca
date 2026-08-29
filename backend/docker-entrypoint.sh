#!/bin/sh
set -e
# Migrations need DIRECT_URL (session :5432). Skip when unset so /health
# still boots in CI smoke without Postgres.
if [ -n "${DIRECT_URL:-}" ] || [ -n "${DATABASE_URL:-}" ]; then
  npx prisma migrate deploy
fi
exec node dist/main
