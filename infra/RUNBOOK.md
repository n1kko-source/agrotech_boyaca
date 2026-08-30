# Runbook de respaldo y restauración — Postgres (AG-40)

Supabase Free **no** tiene backups gestionados. El dump diario vive en **Cloudflare R2** (mismo bucket que PDFs/audio, prefijo aparte). No se usan artifacts de GitHub.

| Dato | Valor |
|------|--------|
| Workflow | `.github/workflows/backup-postgres.yml` |
| Horario | `0 11 * * *` UTC = **06:00 Colombia** |
| Bucket | el de `R2_BUCKET` (p. ej. `agrotech-boyaca`) |
| Prefijo dumps | `backups/postgres/agrotech-YYYYMMDDThhmmssZ.dump` |
| Estado / rachas | `backups/_state/last.json` |
| Retención | 7 días (el job borra; complementar con lifecycle R2) |
| Conexión dump | `DIRECT_URL` — **session pooler `:5432`**, nunca transaction `:6543` |
| Formato | `pg_dump -Fc` (custom) |

Los dumps contienen PII cuando existan productores/posts (Ley 1581). El prefijo `backups/` debe ser **privado**. No pegar URLs ni claves en issues ni en este archivo.

Host de la API: **Render**. Esto no cambia el PaaS.

---

## Registro de prueba

| Fecha (UTC) | Qué | Resultado |
|-------------|-----|-----------|
| 2026-08-29 | `pg_dump -Fc` (PG 17) + restore de `agrotech_backup_canary` en Postgres 17 local | OK (dump ~207 KiB) |
| 2026-08-29 | `PutObject` a R2 `backups/postgres/` | **AccessDenied** — el API token actual no tiene List/Write en el bucket |

Hasta que el token R2 sea **Object Read & Write** sobre `agrotech-boyaca`, el cron de Actions fallará en el upload. Regenerar token en Cloudflare → R2 → Manage API tokens; actualizar secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`. No pegar las claves en el chat.

---

## 1. Comprobar que el último dump existe

```bash
aws --endpoint-url "$R2_ENDPOINT" s3 ls "s3://${R2_BUCKET}/backups/postgres/"
```

El objeto más reciente debe tener fecha de hoy (o de ayer si corres antes de las 06:00 COT).

---

## 2. Restaurar en local (verificación)

Postgres **17** en Docker (Supabase Free hoy es 17.x). Sustituye `DUMP` por el archivo descargado (no commitear).

```bash
aws --endpoint-url "$R2_ENDPOINT" s3 cp \
  "s3://${R2_BUCKET}/backups/postgres/agrotech-YYYYMMDDThhmmssZ.dump" \
  ./agrotech.dump

docker run -d --name agrotech-restore \
  -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore \
  -e POSTGRES_DB=agrotech_restore -p 5433:5432 postgres:17-alpine

# esperar a que acepte conexiones
docker exec agrotech-restore pg_isready -U restore

# Humo (canario) — mismo criterio que CI:
pg_restore --no-owner --no-acl -t agrotech_backup_canary \
  -d "postgresql://restore:restore@127.0.0.1:5433/agrotech_restore" \
  ./agrotech.dump

psql "postgresql://restore:restore@127.0.0.1:5433/agrotech_restore" -c \
  "SELECT dumped_at FROM agrotech_backup_canary WHERE id = 1;"
```

Si `dumped_at` no es de las últimas 24 h, el dump no es el de hoy o el restore falló.

Para cargar **todo** `public` (cuando haya tablas de negocio):

```bash
pg_restore --no-owner --no-acl --schema=public \
  -d "postgresql://restore:restore@127.0.0.1:5433/agrotech_restore" \
  ./agrotech.dump
```

Un restore completo de schemas internos de Supabase (`auth`, `storage`, …) sobre Postgres vanilla **falla**. Eso no invalida el dump; el destino de desastre real es otro proyecto Supabase.

Limpieza: `docker rm -f agrotech-restore` y borrar `./agrotech.dump`.

---

## 3. Restaurar en un proyecto Supabase nuevo (pérdida total)

1. Crear proyecto Free nuevo (o el mismo si el volumen está vacío y aceptas `--clean`).
2. Connection string **session** (pooler puerto `5432`) → `DIRECT_URL` temporal.
3. Desde una máquina con `pg_restore` 16:

```bash
pg_restore --no-owner --no-acl --clean --if-exists --schema=public \
  -d "$DIRECT_URL" ./agrotech.dump
```

4. Verificar:

```sql
SELECT dumped_at FROM agrotech_backup_canary WHERE id = 1;
-- más adelante: conteos de productores / posts / conversaciones
```

5. Apuntar Render (`DATABASE_URL` transaction `:6543` + `DIRECT_URL` session `:5432`) al proyecto restaurado.
6. Health: `GET https://agrotech-8p9b.onrender.com/health`.

Si `pg_restore` se queja de extensiones, instálalas en el SQL editor (`pgcrypto`, `unaccent`, `pg_trgm`) y reintenta. No uses el pooler **transaction** (`6543`) para restore.

---

## 4. El job falló

1. GitHub → Actions → **Postgres backup** → log. No copies secrets del log.
2. Causas frecuentes: `DIRECT_URL` en `:6543`, host `db.*.supabase.co` (IPv6) desde Actions, claves R2 rotas, cupo 500 MB.
3. Re-ejecutar: Actions → Postgres backup → **Run workflow**.
4. Dos fallos seguidos: se abre (o comenta) el issue `AG-40: Postgres backup failed twice consecutively`.

---

## 5. Lifecycle R2 (complemento)

Cloudflare → R2 → bucket → Settings → Object lifecycle:

- Prefix `backups/postgres/`
- Expire after **7** days

El job ya borra objetos viejos; la regla cubre si el prune del workflow falla.

---

## 6. Secretos de GitHub (Actions)

| Secret | Origen |
|--------|--------|
| `SUPABASE_DIRECT_URL` | `DIRECT_URL` local (session `:5432`) |
| `R2_ACCOUNT_ID` | Cloudflare |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token |
| `R2_BUCKET` | p. ej. `agrotech-boyaca` |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |

`RENDER_DEPLOY_HOOK_URL` es de AG-14, no de backups.

El cron **solo corre en `main`**. Hasta mergear este workflow, usa **Run workflow** en la rama donde exista el YAML, o corre `infra/backup/*.sh` en local.
