#Requires -Version 5.1
# AG-40 local restore test: canary → dump → R2 → restore → SELECT dumped_at
# Loads backend/.env without printing secrets. Requires Docker.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envFile = Join-Path $repo 'backend\.env'

function Get-DotEnvValue([string]$path, [string]$key) {
  foreach ($line in Get-Content -Path $path) {
    if ($line -match "^\s*$([regex]::Escape($key))=(.*)$") {
      return $Matches[1].Trim()
    }
  }
  throw "Missing $key in $path"
}

$databaseUrl = Get-DotEnvValue $envFile 'DATABASE_URL'
$session = $databaseUrl -replace ':6543/', ':5432/'
$session = $session -replace '\?pgbouncer=true&', '?'
$session = $session -replace '\?pgbouncer=true$', ''
$session = $session -replace '&pgbouncer=true', ''
# pg_dump needs session pooler (IPv4). db.*.supabase.co is IPv6-only on Free.
$env:DIRECT_URL = $session
$env:R2_ACCOUNT_ID = Get-DotEnvValue $envFile 'R2_ACCOUNT_ID'
$env:R2_ACCESS_KEY_ID = Get-DotEnvValue $envFile 'R2_ACCESS_KEY_ID'
$env:R2_SECRET_ACCESS_KEY = Get-DotEnvValue $envFile 'R2_SECRET_ACCESS_KEY'
$env:R2_BUCKET = Get-DotEnvValue $envFile 'R2_BUCKET'
$env:R2_ENDPOINT = Get-DotEnvValue $envFile 'R2_ENDPOINT'
$env:R2_PREFIX = 'backups/postgres'
$env:RETENTION_DAYS = '7'
$env:AWS_EC2_METADATA_DISABLED = 'true'

$tmp = Join-Path $repo 'infra\backup\tmp'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

Write-Host 'Starting ephemeral Postgres for restore…'
$ErrorActionPreference = 'Continue'
docker rm -f agrotech-restore-pg 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
docker run -d --name agrotech-restore-pg `
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore `
  -e POSTGRES_DB=agrotech_restore -p 55432:5432 postgres:17-alpine | Out-Null

$ErrorActionPreference = 'Continue'
for ($i = 0; $i -lt 30; $i++) {
  docker exec agrotech-restore-pg pg_isready -U restore 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
if ($LASTEXITCODE -ne 0) { throw 'Ephemeral Postgres did not become ready' }
$ErrorActionPreference = 'Stop'

$canarySql = @'
CREATE TABLE IF NOT EXISTS agrotech_backup_canary (
  id smallint PRIMARY KEY,
  dumped_at timestamptz NOT NULL
);
INSERT INTO agrotech_backup_canary (id, dumped_at)
VALUES (1, now())
ON CONFLICT (id) DO UPDATE SET dumped_at = excluded.dumped_at;
'@
Set-Content -Path (Join-Path $tmp 'canary.sql') -Value $canarySql -Encoding ascii

Write-Host 'Dumping (canary + pg_dump) via postgres:17-alpine…'
$ErrorActionPreference = 'Continue'
docker run --rm `
  -e DIRECT_URL `
  -v "${tmp}:/out" `
  postgres:17-alpine `
  sh -c 'psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f /out/canary.sql && pg_dump -Fc --no-owner --no-acl -d "$DIRECT_URL" -f /out/agrotech.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }

$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$key = "backups/postgres/agrotech-$stamp.dump"
Write-Host "Uploading dump to R2 prefix backups/postgres/…"
docker run --rm `
  -e AWS_ACCESS_KEY_ID="$env:R2_ACCESS_KEY_ID" `
  -e AWS_SECRET_ACCESS_KEY="$env:R2_SECRET_ACCESS_KEY" `
  -e AWS_DEFAULT_REGION=auto `
  -e AWS_EC2_METADATA_DISABLED=true `
  -v "${tmp}:/out" `
  amazon/aws-cli `
  --endpoint-url $env:R2_ENDPOINT s3 cp /out/agrotech.dump "s3://$($env:R2_BUCKET)/$key"
if ($LASTEXITCODE -ne 0) { throw 'R2 upload failed' }

Write-Host 'Restoring canary into ephemeral Postgres…'
docker run --rm --add-host=host.docker.internal:host-gateway `
  -v "${tmp}:/out" `
  postgres:17-alpine `
  sh -c 'pg_restore --no-owner --no-acl --exit-on-error -t agrotech_backup_canary -d "postgresql://restore:restore@host.docker.internal:55432/agrotech_restore" /out/agrotech.dump && psql "postgresql://restore:restore@host.docker.internal:55432/agrotech_restore" -tA -c "SELECT dumped_at FROM agrotech_backup_canary WHERE id = 1;"'
if ($LASTEXITCODE -ne 0) { throw 'Restore test failed' }
$ErrorActionPreference = 'Stop'

Write-Host "Restore test OK. Object key: $key"
docker rm -f agrotech-restore-pg | Out-Null
Remove-Item -Force (Join-Path $tmp 'agrotech.dump'), (Join-Path $tmp 'canary.sql') -ErrorAction SilentlyContinue
