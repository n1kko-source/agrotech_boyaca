# AG-12 — Aprovisionamiento free-tier

Guía operativa para levantar la infraestructura MVP de **AgroTech Boyacá**.
Las cuentas y secretos los crea el equipo en cada consola; este repo solo deja
plantillas, variables y el endpoint `/health`.

| Servicio | Rol | Plan |
|----------|-----|------|
| [Railway](https://railway.app) | Host NestJS | Free / trial hours |
| [Supabase](https://supabase.com) | PostgreSQL | Free (500 MB) |
| [Upstash](https://upstash.com) | Redis (throttle, refresh tokens) | Free (10k req/día) |
| [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) | PDF / audio | Free tier |
| [Firebase](https://console.firebase.google.com) | Auth OTP SMS + FCM | Spark (gratis) |
| [cron-job.org](https://cron-job.org) | Anti-sleep `GET /health` | Free |

Detalle de límites: [`docs/BASE_INFRAESTRUCTURA.md`](../docs/BASE_INFRAESTRUCTURA.md) §5.
Migración de tier: [`migration-notes.md`](./migration-notes.md).

---

## Checklist AG-12

- [ ] Proyecto Supabase + `DATABASE_URL` / `DIRECT_URL`
- [ ] Redis Upstash + `UPSTASH_REDIS_*` / `REDIS_URL`
- [ ] Bucket R2 + API token + `R2_*`
- [ ] Proyecto Firebase (Auth + Cloud Messaging) + service account
- [ ] Servicio Railway (Root Directory = `backend`) + variables de entorno
- [ ] Deploy OK → `GET https://<app>/health` responde `{"status":"ok",...}`
- [ ] Cron cada 25 min a `/health` ([`cron-health.md`](./cron-health.md))
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

---

## 2. Upstash (Redis)

1. Crear base Redis (región cercana a Railway).
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
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. Dominio público / CDN opcional → `R2_PUBLIC_BASE_URL` (puede quedar vacío en Sprint 0).

---

## 4. Firebase (OTP + FCM)

1. Crear proyecto Firebase (mismo nombre org. que AgroTech).
2. Habilitar **Authentication** → método teléfono (OTP SMS) cuando el ticket Auth lo requiera.
3. Habilitar **Cloud Messaging** (FCM) para push Android.
4. **Project settings → Service accounts → Generate new private key**:
   - Usar `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` en Railway / `.env`
   - El JSON **no** se versiona (ver `.gitignore`)
5. App Android: descargar `google-services.json` → `mobile/android/app/` (gitignored).
6. No commitear `firebase_options.dart` ni service accounts.

---

## 5. Railway (NestJS)

### Servicio

1. New Project → Deploy from GitHub repo `agrotech_boyaca`.
2. **Root Directory** = `backend` (obligatorio: Dockerfile y `railway.json` viven ahí).
3. Builder: Dockerfile (`backend/Dockerfile`, multi-stage Node 20).
4. Healthcheck: path `/health` (también en `backend/railway.json`).
5. Variables: pegar desde `.env.example` con valores reales (DATABASE, Redis, R2, Firebase, `PORT=3000`).
6. Generar dominio público → anotar `APP_PUBLIC_URL`.

### Verificación

```bash
curl -s https://<tu-servicio>.up.railway.app/health
# {"status":"ok","service":"agrotech-backend","timestamp":"..."}
```

Copia de referencia del config: este directorio tiene `railway.json`; la **fuente canónica** para el deploy es `backend/railway.json`.

---

## 6. Anti-sleep (cron-job.org)

Ver [`cron-health.md`](./cron-health.md).

Resumen: `GET {APP_PUBLIC_URL}/health` cada **25 minutos** para evitar hibernación del free tier.

---

## Seguridad (Ley 1581)

- Nunca subir `.env`, `*.pem`, service accounts ni `google-services.json`.
- Rotar tokens si se filtran en un PR o chat.
- Logs: no imprimir teléfono, NIT, email ni connection strings completas.

---

## Qué NO incluye AG-12

- Schema Prisma / migraciones
- Integración NestJS real con Supabase/Redis/R2/Firebase (módulos de dominio)
- Configuración productiva de OTP templates ni campañas FCM
- Dominio custom / TLS avanzado más allá del default de Railway
