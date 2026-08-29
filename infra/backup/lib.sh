#!/usr/bin/env bash
# Shared helpers for AG-40 backup scripts. Source only; do not exec.
set -euo pipefail

R2_PREFIX="${R2_PREFIX:-backups/postgres}"
R2_STATE_KEY="${R2_STATE_KEY:-backups/_state/last.json}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing required env ${name}" >&2
    exit 1
  fi
}

configure_r2() {
  if [[ -z "${R2_ENDPOINT:-}" && -n "${R2_ACCOUNT_ID:-}" ]]; then
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  fi
  require_env R2_ENDPOINT
  export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
  export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
  export AWS_EC2_METADATA_DISABLED=true
  # Avoid AWS CLI v2 writing to ~/.aws
  export AWS_ENDPOINT_URL="${R2_ENDPOINT}"
}

aws_r2() {
  aws --endpoint-url "$R2_ENDPOINT" "$@"
}

psql_cmd() {
  if command -v psql >/dev/null 2>&1; then
    psql "$@"
  else
    echo "::error::psql not found" >&2
    exit 1
  fi
}

pg_dump_cmd() {
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$@"
  else
    echo "::error::pg_dump not found" >&2
    exit 1
  fi
}

pg_restore_cmd() {
  if command -v pg_restore >/dev/null 2>&1; then
    pg_restore "$@"
  else
    echo "::error::pg_restore not found" >&2
    exit 1
  fi
}
