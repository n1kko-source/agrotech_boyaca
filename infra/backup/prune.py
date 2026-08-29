#!/usr/bin/env python3
"""Delete R2 objects under backups/postgres/ older than RETENTION_DAYS (default 7).

Uses AWS CLI (already configured via lib.sh / AWS_ENDPOINT_URL). No boto3.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

PREFIX = os.environ.get("R2_PREFIX", "backups/postgres")
DAYS = int(os.environ.get("RETENTION_DAYS", "7"))
BUCKET = os.environ["R2_BUCKET"]
ENDPOINT = os.environ.get("AWS_ENDPOINT_URL") or os.environ.get("R2_ENDPOINT")


def aws(*args: str) -> subprocess.CompletedProcess[str]:
    cmd = ["aws", "--endpoint-url", ENDPOINT, *args]
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def main() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS)
    deleted = 0
    token = None
    while True:
        args = [
            "s3api",
            "list-objects-v2",
            "--bucket",
            BUCKET,
            "--prefix",
            f"{PREFIX}/",
            "--output",
            "json",
        ]
        if token:
            args.extend(["--continuation-token", token])
        payload = json.loads(aws(*args).stdout or "{}")
        for obj in payload.get("Contents") or []:
            key = obj["Key"]
            if key.endswith("/") or "/_state/" in key:
                continue
            last = datetime.fromisoformat(obj["LastModified"].replace("Z", "+00:00"))
            if last < cutoff:
                aws("s3api", "delete-object", "--bucket", BUCKET, "--key", key)
                deleted += 1
                print(f"Deleted expired dump: {key}")
        token = payload.get("NextContinuationToken")
        if not token:
            break
    print(f"Prune complete ({deleted} object(s) older than {DAYS}d).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
