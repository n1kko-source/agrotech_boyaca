# AG-12 — Aprovisionamiento free-tier

**Host canónico del backend: [Render](https://render.com)** (Web Service Docker, Free, Ohio).
URL de producción: `https://agrotech-8p9b.onrender.com`. Es el único PaaS de la API.

Guía operativa para levantar la infraestructura MVP de **AgroTech Boyacá**.
Las cuentas y secretos los crea el equipo en cada consola; este repo solo deja
plantillas, variables y el endpoint `/health`.

| Servicio | Rol | Plan |
|----------|-----|------|
| [Render](https://render.com) | Host NestJS (Web Service) | Free (750 h/mes, sleep 15 min) |
| [Supabase](https://supabase.com) | PostgreSQL | Free (500 MB) |
| [Upstash](https://upstash.com) | Redis (throttle, refresh tokens) | Free (10k req/día) |
| [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) | PDF / audio | Free tier |
| [Firebase](https://console.firebase.google.com) | Auth OTP SMS + FCM | Spark (gratis) |
| [OpenWeather](https://openweathermap.org/api) | Clima actual + forecast 5d/3h | Free |
| [cron-job.org](https://cron-job.org) | Anti-sleep `GET /health` + job alertas | Free |

Detalle de límites: [`docs/BASE_INFRAESTRUCTURA.md`](../docs/BASE_INFRAESTRUCTURA.md) §5.
Migración de tier: [`migration-notes.md`](./migration-notes.md).
Blueprint (sin secretos): [`render.yaml`](../render.yaml).

---

## Checklist AG-12

- [ ] Proyecto Supabase + `DATABASE_URL` / `DIRECT_URL`
- [ ] Redis Upstash + `UPSTASH_REDIS_*` / `REDIS_URL`
- [ ] Bucket R2 + API token + `R2_*`
- [ ] Proyecto Firebase (Auth + Cloud Messaging) + service account
- [ ] Web Service Render (Docker, root/`dockerContext` = `backend`) + variables de entorno
- [ ] Deploy OK → `GET https://<app>.onrender.com/health` responde `{"status":"ok",...}` **en caliente** (sin página de wake-up)
- [ ] Cron cada **10 min** a `/health` ([`cron-health.md`](./cron-health.md))
- [ ] Cron cada **3 h** a `POST /clima/jobs/evaluate` (header `x-clima-job-secret`)
- [ ] Secretos solo en consolas / `.env` local (nunca en git)

Plantilla de variables: [`backend/.env.example`](../backend/.env.example).

---

## 1. Supabase (PostgreSQL)

1. Crear proyecto en la región más cercana (p. ej. `us-east-1` o `sa-east-1`).
2. **Project Settings → Database**:
   - Copiar **URI** del pooler (Transaction, puerto `6543`) → `DATABASE_URL`
   - Copiar URI directa (puerto `5432`) → `DIRECT_URL` (migraciones Prisma más adelante)
3. Guardar la DB password en el gestor de secretos del equipo.
4. No hace falta schema aún (Prisma llega en tickets posteriores).
5. Render es IPv4: usar el **pooler** en `DATABASE_URL`. El host `db.*.supabase.co:5432` puede fallar por IPv6.

---

## 2. Upstash (Redis)

1. Crear base Redis (región cercana a Render; p. ej. US East si el Web Service está en Ohio).
2. Copiar:
   - REST URL → `UPSTASH_REDIS_REST_URL`
   - REST TOKEN → `UPSTASH_REDIS_REST_TOKEN`
   - Redis URL (`rediss://…`) → `REDIS_URL`
3. Monitorear el tope de **10.000 requests/día** en free tier.

---

## 3. Cloudflare R2

1. Cloudflare Dashboard → **R2** → Create bucket (ej. `agrotech-boyaca`).
2. **Manage R2 API Tokens** → Create API token (Object Read & Write sobre el bucket).
3. Rellenar:
   - `R2_ACCOUNT_ID` (barra derecha del dashboard; no es el Access Key)
   - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. Dominio público / CDN opcional → `R2_PUBLIC_BASE_URL` (puede quedar vacío; las descargas de guías van por `GET /guias/:id/archivo` con JWT, no por dominio público).
5. AG-26: el token debe poder **Put/Get/Delete** en el prefijo `guias/`. El Dockerfile de backend instala `ffmpeg` (Opus 16 kbps). `GET /health` → `r2.storageBytes` / `r2.reads` (cupo 10 GB / 1 M lecturas). Los dumps de AG-40 en `backups/postgres/` **también** cuentan al 10 GB del bucket.

---

## 4. Firebase (OTP + FCM)

1. Crear proyecto Firebase (mismo nombre org. que AgroTech).
2. Habilitar **Authentication** → métodos **Phone** (OTP SMS, NATURAL) y **Email/Password** (JURIDICA). Copiar el **Web API key** (Project settings → General) → `FIREBASE_WEB_API_KEY`.
   - Android: Play Integrity (SHA-256 del package) para que `POST /auth/otp/send` pueda reenviar el `playIntegrityToken`.
   - Números de prueba en Authentication → Sign-in method → Phone (staging, sin SMS real).
   - Plantilla de verificación de email en Authentication → Templates (idioma `es`). `POST /auth/register/juridica` llama `accounts:signUp` + `accounts:sendOobCode` (VERIFY_EMAIL). Si el INSERT en Postgres falla, se borra el usuario de Firebase (`accounts:delete`). El login exige email verificado en Firebase **y** `verified = true` en Postgres (activación tras revisión documental).
   - Reenvío: `POST /auth/register/juridica/resend` `{ email, password }`.
   - Operadores (AG-17): no hay registro público de admin. Sembrar:
     ```bash
     npm run auth:create-admin -- ops@example.com 'a-strong-password'
     ```
     Login: `POST /auth/login/admin` `{ email, password }` → JWT `role: ADMIN`.
     `GET /admin/juridica/pending` y `PATCH /admin/juridica/:id/verify` `{ verified }`.
     Aviso al verificar: email vía Resend si `RESEND_API_KEY` + `MAIL_FROM`; si no, log sin PII.
     El script `auth:verify-juridica` queda como fallback operativo (sin auditoría de operador).
3. Habilitar **Cloud Messaging** (FCM) para push Android. El backend (AG-24) envía
   con la API HTTP v1 (`https://fcm.googleapis.com/v1/projects/{id}/messages:send`)
   firmando un JWT de service account. **No** hay `firebase-admin` ni
   `GOOGLE_APPLICATION_CREDENTIALS` en Render.
   - Credenciales: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
   - Sin esas tres variables, `NotificationService.send` persiste la fila en
     `notifications` (estado `PENDING`) y el cliente la reclama con
     `GET /notifications/pending` al reconectar.
   - Tokens se borran solo si FCM responde `UNREGISTERED`, `NOT_FOUND` o
     `SENDER_ID_MISMATCH`. Un HTTP 400 / `INVALID_ARGUMENT` genérico no
     limpia el token. TTL FCM Android: 28 días (zona rural).
4. **Project settings → Service accounts → Generate new private key**:
   - Usar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` en Render / `.env`
   - El JSON **no** se versiona (ver `.gitignore`)
   - En Render **no** uses `GOOGLE_APPLICATION_CREDENTIALS` (el archivo no está en la imagen Docker)
5. App Android: descargar `google-services.json` → `mobile/android/app/` (gitignored).
6. No commitear `firebase_options.dart` ni service accounts.

### OpenWeather (AG-25)

1. [openweathermap.org](https://openweathermap.org/api) → API keys (Current + 5 day / 3 hour; **no** One Call 3.0 de pago).
2. `OPENWEATHER_API_KEY` en Render / `.env`. Sin ella, `GET /clima/:municipio` responde `503`.
3. `CLIMA_JOB_SECRET` (valor aleatorio largo). Cron: [`cron-health.md`](./cron-health.md).

### Suscripciones (AG-29)

1. `SUSCRIPCIONES_JOB_SECRET` (valor aleatorio largo). Cron diario: [`cron-health.md`](./cron-health.md).
2. Pagos se registran a mano (`POST /admin/suscripciones/:userId/pagos`). Demo: `npm run suscripciones:grant -- <userId>` desde `backend/`.

---

## 5. Render (NestJS)

### Servicio

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service** → repo GitHub `agrotech_boyaca`.
2. Runtime: **Docker**.
3. Dockerfile Path: `backend/Dockerfile` · Docker context: `backend` (el Dockerfile asume ese contexto).
4. Instance: **Free**. Región recomendada hacia Colombia: **Ohio**.
5. Health Check Path: `/health`.
6. Variables: pegar desde `.env.example` con valores reales (DATABASE, Redis, R2, Firebase, JWT, PII).
   - **No** definas `PORT` (Render lo inyecta).
   - **No** definas `GOOGLE_APPLICATION_CREDENTIALS`.
   - AG-15: `JWT_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`, `PII_ENCRYPTION_KEY`, `PII_HASH_PEPPER` (además de `JWT_PUBLIC_KEY`).
   - AG-25: `OPENWEATHER_API_KEY`, `CLIMA_JOB_SECRET`.
   - AG-29: `SUSCRIPCIONES_JOB_SECRET`.
   - Migraciones Prisma corren al arrancar el contenedor (`DIRECT_URL` session `:5432`).
7. Dominio público → `APP_PUBLIC_URL` (local y referencia del cron), p. ej. `https://agrotech-8p9b.onrender.com`.

Blueprint equivalente (sin secretos): [`render.yaml`](../render.yaml) en la raíz del monorepo.

### Verificación

```bash
curl -sS https://<tu-servicio>.onrender.com/health
# {"status":"ok","service":"agrotech-backend","timestamp":"..."}
```

Si responde HTML de “waking up”, el servicio hibernó: falta el cron de 10 min.

---

## 6. Anti-sleep (cron-job.org)

Ver [`cron-health.md`](./cron-health.md).

Resumen: `GET {APP_PUBLIC_URL}/health` cada **10 minutos**. Render Free se duerme a los **15 min** de inactividad; 25 min no alcanza.

---

## 7. CI/CD (AG-14) — GitHub Actions → Render

CD despliega **solo en Render**, después de que lint/build/tests + smoke pasen en `main`.

Workflow: [`.github/workflows/backend-ci.yml`](../.github/workflows/backend-ci.yml).

Pendiente operativo:

- [x] Secret de GitHub `RENDER_DEPLOY_HOOK_URL` (Actions → Secrets; el valor no va en git)
- [ ] Render → Settings → **Auto-Deploy = No**

| Evento | Qué corre |
|--------|-----------|
| Push / PR que toca `backend/**` | `lint:check` + `build` + unit + integration + e2e, luego smoke k6 |
| Push a `main` (tras quality + smoke OK) | `POST` al Deploy Hook de Render |

El estado del job **Lint, build & tests** es el check visible en el PR (no hace falta un bot de comentarios).

### Secretos de GitHub

1. Render Dashboard → tu Web Service → **Settings → Deploy Hook** → copiar URL.
2. GitHub → repo → **Settings → Secrets and variables → Actions** → New repository secret:
   - Nombre: `RENDER_DEPLOY_HOOK_URL`
   - Valor: la URL del hook (es secreta; si se filtra, **Regenerate Hook** en Render).
3. Render → Settings → **Auto-Deploy = No**. Si queda en Yes, Render despliega el merge *antes* de que CI termine (y el hook dispara un segundo deploy). El pipeline es el único que debe shippear.

El job de deploy usa el environment `production` de GitHub (se crea solo en el primer run). No requiere reviewers a menos que los actives.

---

## 8. Backups Postgres (AG-40)

Supabase Free no ofrece PITR. Dump diario con GitHub Actions → **R2** prefijo `backups/postgres/` (no artifacts).

- Workflow: [`.github/workflows/backup-postgres.yml`](../.github/workflows/backup-postgres.yml)
- Scripts: [`infra/backup/`](./backup/)
- Restauración: [`RUNBOOK.md`](./RUNBOOK.md)

### Secretos extra (Actions)

| Secret | Variable local |
|--------|----------------|
| `SUPABASE_DIRECT_URL` | `DIRECT_URL` (session `:5432`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | igual |
| `R2_BUCKET` / `R2_ENDPOINT` | igual |

Canario: tabla `agrotech_backup_canary` (1 fila). El job restaura esa tabla en Postgres efímero; si no hay fila, el dump no cuenta como backup.

Alerta: 2 fallos seguidos → issue GitHub `AG-40: Postgres backup failed twice consecutively`.

Lifecycle R2: expirar `backups/postgres/` a 7 días (además del prune del job).

El token R2 de Actions necesita **Object Read & Write** (y List) en el bucket. Un token de solo lectura produce `AccessDenied` en `PutObject`.

---

## Seguridad (Ley 1581)

- Nunca subir `.env`, `*.pem`, service accounts, `google-services.json` ni dumps `*.dump`.
- Rotar tokens si se filtran en un PR o chat.
- Logs: no imprimir teléfono, NIT, email ni connection strings completas.
- Dumps en R2 son PII; prefijo `backups/` privado.

---

## Qué NO incluye AG-12

- Schema Prisma / migraciones
- Integración NestJS real con Supabase/Redis/R2/Firebase (módulos de dominio)
- Configuración productiva de OTP templates ni campañas FCM
- Dominio custom / TLS avanzado más allá del default de Render
