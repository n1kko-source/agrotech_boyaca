#!/usr/bin/env bash
# AG-40 — pg_dump (custom format) → Cloudflare R2 prefix backups/postgres/
# Requires: DIRECT_URL (session pooler :5432), R2_* credentials.
# Never print connection strings or keys.
set -euo pipefail

source "$(dirname "$0")/lib.sh"

require_env DIRECT_URL
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env R2_BUCKET
configure_r2

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_FILE:-${TMPDIR:-/tmp}/agrotech-${STAMP}.dump}"
KEY="${R2_PREFIX}/agrotech-${STAMP}.dump"

echo "Upserting backup canary on production…"
psql_cmd "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/canary.sql"

echo "Dumping database (custom format)…"
pg_dump_cmd -Fc --no-owner --no-acl -d "$DIRECT_URL" -f "$OUT"
test -s "$OUT"

echo "Uploading dump to R2 (${R2_PREFIX}/)…"
aws_r2 s3 cp "$OUT" "s3://${R2_BUCKET}/${KEY}" --only-show-errors

echo "Pruning dumps older than ${RETENTION_DAYS} days…"
python3 "$(dirname "$0")/prune.py"

echo "DUMP_KEY=${KEY}"
echo "BACKUP_FILE=${OUT}"
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "BACKUP_FILE=${OUT}" >> "$GITHUB_ENV"
  echo "DUMP_KEY=${KEY}" >> "$GITHUB_ENV"
fi
echo "Dump uploaded."
