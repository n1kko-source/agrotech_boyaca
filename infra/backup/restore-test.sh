#!/usr/bin/env bash
# AG-40 — Restore the dump just taken into an empty Postgres and read the canary.
# Proves the file is restorable, not only that pg_dump exited 0.
set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

require_env RESTORE_URL
DUMP="${BACKUP_FILE:-}"
if [[ -z "$DUMP" || ! -s "$DUMP" ]]; then
  echo "::error::BACKUP_FILE missing or empty; dump step must run first." >&2
  exit 1
fi

echo "Restoring canary table into ephemeral Postgres…"
# Full dump may include Supabase-internal schemas; the smoke test only
# restores public.agrotech_backup_canary so vanilla Postgres can verify the file.
pg_restore_cmd --no-owner --no-acl --exit-on-error \
  -t agrotech_backup_canary \
  -d "$RESTORE_URL" "$DUMP"

echo "Verifying canary row…"
CANARY="$(psql_cmd "$RESTORE_URL" -tA -c \
  "SELECT dumped_at FROM agrotech_backup_canary WHERE id = 1;")"
if [[ -z "$CANARY" ]]; then
  echo "::error::Restore test failed: agrotech_backup_canary has no row." >&2
  exit 1
fi
echo "Restore test OK. Canary dumped_at=${CANARY}"
