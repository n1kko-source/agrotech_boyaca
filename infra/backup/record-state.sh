#!/usr/bin/env bash
# Persist last backup result on R2. On the 2nd consecutive failure, open a GitHub issue.
# Usage: record-state.sh ok|fail
set -euo pipefail

# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"

STATUS="${1:-}"
if [[ "$STATUS" != "ok" && "$STATUS" != "fail" ]]; then
  echo "Usage: $0 ok|fail" >&2
  exit 1
fi

require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env R2_BUCKET
configure_r2

PREV_JSON="{}"
if aws_r2 s3 cp "s3://${R2_BUCKET}/${R2_STATE_KEY}" - --only-show-errors >/tmp/backup-last.json 2>/dev/null; then
  PREV_JSON="$(cat /tmp/backup-last.json)"
fi

python3 - "$STATUS" "$PREV_JSON" <<'PY'
import json, os, sys
from datetime import datetime, timezone

status, prev_raw = sys.argv[1], sys.argv[2]
try:
    prev = json.loads(prev_raw) if prev_raw.strip() else {}
except json.JSONDecodeError:
    prev = {}

if status == "ok":
    consecutive = 0
else:
    consecutive = int(prev.get("consecutive_fails") or 0) + 1

state = {
    "status": status,
    "consecutive_fails": consecutive,
    "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "run_id": os.environ.get("GITHUB_RUN_ID") or "",
    "run_url": os.environ.get("GITHUB_SERVER_URL", "")
    + "/"
    + os.environ.get("GITHUB_REPOSITORY", "")
    + "/actions/runs/"
    + os.environ.get("GITHUB_RUN_ID", ""),
}
out = "/tmp/backup-state-new.json"
with open(out, "w", encoding="utf-8") as fh:
    json.dump(state, fh)
    fh.write("\n")
print(f"STATE_CONSECUTIVE={consecutive}")
print(f"STATE_STATUS={status}")
open("/tmp/backup-consecutive", "w", encoding="utf-8").write(str(consecutive))
PY

aws_r2 s3 cp /tmp/backup-state-new.json "s3://${R2_BUCKET}/${R2_STATE_KEY}" --only-show-errors

CONSEC="$(cat /tmp/backup-consecutive)"
if [[ "$STATUS" == "fail" && "$CONSEC" -ge 2 ]]; then
  if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
    echo "::error::Backup failed ${CONSEC} times in a row; cannot open GitHub issue (no token)." >&2
    exit 0
  fi
  export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
  TITLE="AG-40: Postgres backup failed twice consecutively"
  EXISTING="$(gh issue list --repo "${GITHUB_REPOSITORY}" --state open --search "\"${TITLE}\" in:title" --json number --jq '.[0].number' 2>/dev/null || true)"
  BODY="The scheduled Postgres backup to R2 failed **${CONSEC}** consecutive times.

- Workflow run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}
- Prefix: \`backups/postgres/\`
- Runbook: \`infra/RUNBOOK.md\`

Do not paste connection strings or R2 keys here. Inspect the Actions log, fix, then re-run **Postgres backup** (workflow_dispatch)."
  if [[ -n "$EXISTING" ]]; then
    gh issue comment "$EXISTING" --repo "${GITHUB_REPOSITORY}" --body "$BODY"
    echo "Commented on existing issue #${EXISTING}"
  else
    gh issue create --repo "${GITHUB_REPOSITORY}" --title "$TITLE" --body "$BODY"
    echo "Opened GitHub issue for consecutive backup failures."
  fi
fi

if [[ "$STATUS" == "ok" ]]; then
  echo "Backup state recorded: ok."
fi
