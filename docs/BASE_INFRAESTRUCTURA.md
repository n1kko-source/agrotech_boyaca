# AgroTech Boyacá — Contexto arquitectónico

> Guía base del proyecto. **El código en este repo manda.** Si un ticket Jira contradice lo implementado, se sigue el código y se actualiza este archivo en el mismo cambio.
> Host backend: **Render** · Última alineación: auth NATURAL / JURIDICA / ADMIN, consentimiento Ley 1581 (AG-41), `AdminModule`, FTS de comunidad (AG-21), precios de commodities (AG-23) y push FCM (AG-24).

## Host de ejecución (canónico)

El backend vive **solo en Render**. No hay segundo host ni CLI de otro PaaS.

| Rol | Servicio | Dato |
|-----|----------|------|
| API NestJS | Render Web Service (Docker, Free, Ohio) | `https://agrotech-8p9b.onrender.com` |
| Health / cron | `GET /health` cada 10 min | JSON `{"status":"ok",...}` (público, sin throttle) |
| CI/CD | GitHub Actions → Deploy Hook de Render | merge a `main` · Auto-Deploy de Render = No |
| Backups Postgres | GitHub Actions `pg_dump` → R2 `backups/postgres/` | diario 06:00 COT, retención 7d |
| Blueprint | [`render.yaml`](../render.yaml) | Dockerfile `backend/Dockerfile` · contexto Docker = `backend` |

Aprovisionamiento operativo: [`infra/PROVISIONING.md`](../infra/PROVISIONING.md).

---

## 1. Contexto del producto

Marketplace ecosistémico agrícola para el departamento de Boyacá, Colombia. Conecta productores rurales directamente con compradores, eliminando intermediarios. Basado en investigación académica (Bernal, Muñoz, González - UPTC) con validación de campo en Siachoque, Boyacá.

**Pain point principal:** intermediación comercial que captura el mayor margen de ganancia del productor.

**Funciones priorizadas por usuarios reales (Tabla 2 del paper):**

- Comparación de precios (alta)
- Ventas digitales (alta)
- Logística y transporte (alta)
- Contacto con proveedores (media)
- Pronóstico climático (media)

---

## 2. Usuarios y roles

Hay **tres roles** de acceso (`Role` en Prisma y en el JWT). `empresa` **no es un rol**.

| Rol | Quién | Autenticación | Notas |
|---|---|---|---|
| `NATURAL` | Campesino individual, productor | OTP SMS (Firebase Phone) → JWT | Teléfono cifrado; cuenta nace `verified = true` |
| `JURIDICA` | Asociación, cooperativa o empresa compradora | Email/password (Firebase) → JWT | Email + NIT cifrados; `entityType` en el perfil |
| `ADMIN` | Operador interno (revisión JURIDICA) | Email/password (Firebase) → JWT | **No hay registro HTTP.** Se siembra con `npm run auth:create-admin` |

`entityType` (solo JURIDICA): `asociacion` \| `cooperativa` \| `empresa`. Viaja en el JWT y en `request.user` como propiedad de perfil, nunca como `role`.

Login JURIDICA exige **las dos** condiciones: email verificado en Firebase **y** `verified = true` en Postgres (activación de operador). NATURAL no usa ese flag de operador. ADMIN se autentica por email; no hay registro público.

**Perfil técnico del usuario de producto (NATURAL / JURIDICA):**

- Dispositivo: Android gama baja/media
- Conectividad: 2G/3G intermitente (Boyacá rural)
- 81.6% con smartphone · 90.4% uso activo diario
- Herramienta principal actual: WhatsApp y llamadas

ADMIN no es usuario de la app rural: opera contra la API (Postman / curl / futuro panel). No hay panel Flutter de administración en este corte.

---

## 3. Plataforma cliente

**Decisión: Flutter (Android primero)**

- Desarrollo directo como app nativa Android con Flutter
- Offline-first con SQLite local (`sqflite`)
- Sincronización con backend al recuperar señal vía `/sync` (módulo aún no implementado)
- Push notifications nativas vía FCM (`NotificationsModule`; módulo de noticias no implementado)
- **Fase 2:** mismo codebase Flutter compila para iOS sin reescritura
- PWA descartada: Service Workers poco confiables en 2G/3G rural

---

## 4. Backend

**Framework:** NestJS (TypeScript) — monolito modular (no microservicios en v1).

**Justificación monolito:** evita latencia inter-servicio bajo 2G/3G, reduce complejidad operativa en fase MVP, extractable a microservicios cuando la carga lo justifique.

Entry: `AppModule` importa `SharedModule`, `PrismaModule`, `NotificationsModule`, `AuthModule`, `AdminModule`, `ComunidadModule`, `CommoditiesModule`.

### 4.1 Módulos — implementados

| Módulo | Responsabilidad |
|---|---|
| SharedModule | Kernel: JWT RS256, `JwtAuthGuard` + `RolesGuard` globales, throttle Redis, Pino (redact PII), Helmet, ValidationPipe, cursor pagination, `GlobalExceptionFilter` |
| PrismaModule | Postgres (Supabase). `DATABASE_URL` pooler `:6543`; `DIRECT_URL` session `:5432` para migraciones/backups |
| AuthModule | OTP NATURAL · registro/login JURIDICA · login ADMIN · issue/revoke refresh (una sesión por usuario) · `GET /auth/me` |
| AdminModule | Operador: listar JURIDICA pendientes · `PATCH` verify · auditoría UUID · email de aviso |
| ComunidadModule | Posts de marketplace · perfiles públicos productor/comprador · FTS PostgreSQL (`unaccent` + `pg_trgm`). Matching y mensajería aún no |
| CommoditiesModule | Precio vigente COP por producto+región · cache Redis TTL 60 s · invalidación al upsert. Solo JURIDICA verificada escribe |
| NotificationsModule | FCM HTTP v1 · registro de token por dispositivo · `NotificationService.send(userId, payload)` (global, lo inyectan Comunidad/Commodities) · inbox Postgres si el dispositivo está offline · limpieza de tokens inválidos |

### 4.2 Módulos — previstos (aún no hay código)

| Módulo | Responsabilidad |
|---|---|
| NoticiasModule | WebSocket Gateway · Alertas · Clima (el push FCM vive en `NotificationsModule`) |
| GuiasModule | PDF/Audio metadata · Entrega low-bandwidth (R2) |
| SyncModule | `POST /sync` · batch offline · conflicto LWW |

No implementar estos módulos “porque el ticket lo nombra” si el kernel de auth/admin no está cerrado. Extender este archivo cuando existan.

### 4.3 Auth — contrato HTTP

Público (`@Public()`), salvo `GET /auth/me` y `POST /auth/privacy/deletion-request`.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/auth/otp/send` | NATURAL | Envía OTP (Firebase o modo local). Rate limit estricto |
| `POST` | `/auth/otp/verify` | NATURAL | `{ phone, code, acceptPrivacyPolicy: true, fcmToken?, deviceId? }`. JWT 15 min + refresh 7 d. Sin consentimiento → `400`. Persiste versión de política + timestamp (no se sobrescribe en logins posteriores). Si vienen `fcmToken`+`deviceId`, registra el dispositivo **sin `await`** (fire-and-forget: el JWT vuelve antes del flush FCM; errores solo a log, sin PII ni `fcmToken`) |
| `POST` | `/auth/register/juridica` | JURIDICA | `{ email, password, nit, entityType, acceptPrivacyPolicy: true }`. Firebase `signUp` + mail de verificación. Fila `verified = false`. Si Postgres falla tras Firebase → `accounts:delete`. Sin consentimiento → `400` |
| `POST` | `/auth/register/juridica/resend` | JURIDICA | Reenvía oob de email |
| `POST` | `/auth/login/juridica` | JURIDICA | JWT 60 min + refresh 30 d. `403` si falta email Firebase o `verified`. `fcmToken`+`deviceId` opcionales (mismo bind fire-and-forget que NATURAL) |
| `POST` | `/auth/login/admin` | ADMIN | JWT 60 min + refresh 7 d. Semilla CLI, no hay `POST /auth/register/admin` |
| `POST` | `/auth/refresh` | los tres | Rota el refresh con `GETDEL` (atómico). Un refresh vivo por usuario. Respeta TTL del **rol**. JURIDICA deja de rotar si `verified` pasa a `false` |
| `POST` | `/auth/logout` | los tres | Revoca el refresh actual y el índice de sesión en Redis. `deviceId` opcional (8–128 chars); si viene, baja ese token **después** de revocar el refresh (best-effort: fallo de store no aborta el logout). Sigue existiendo `DELETE /notifications/devices` |
| `GET` | `/auth/me` | JWT (cualquier rol autenticado) | `{ sub, role, entityType? }`. Sin `@Roles`: basta el Bearer |
| `POST` | `/auth/privacy/deletion-request` | JWT (cualquier rol autenticado) | Habeas data: `{ requested: true }`. Idempotente. No borra la cuenta; soporte cumple a mano (MVP) |
| `GET` | `/legal/privacy-policy` | público | `{ version, title, acceptLabel, markdown }`. Texto Ley 1581 para el checkbox |
| `GET` | `/legal/privacy-policy.md` | público | El mismo texto, `Content-Type: text/markdown` |

Refresh: bytes aleatorios. Redis guarda `agrotech:refresh:{sha256}` y `agrotech:refresh-session:{sub}` (un hash vivo). Un login o refresh nuevo invalida el refresh anterior de ese usuario. Access token: RS256, claims `sub`, `role`, y `entityType` solo si `role = JURIDICA`. El access sigue válido hasta su TTL tras logout (15–60 min); no hay denylist.

TTL (constantes en `token.service.ts`; no se leen de `JWT_*_TTL` del `.env`):

| Rol | Access | Refresh |
|---|---|---|
| NATURAL | 15 min | 7 d |
| JURIDICA | 60 min | 30 d |
| ADMIN | 60 min | 7 d |

Guards globales: sin `@Public()` hace falta Bearer JWT. `@Roles(...)` restringe el claim `role`. `entityType` no entra al guard de roles.

### 4.4 Admin — contrato HTTP

Todo bajo `@Roles(ADMIN)`. NATURAL / JURIDICA → `403`. Sin token → `401`.

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/admin/juridica/pending` | Cursor (`limit`/`cursor`). Ítems: `id`, `entityType`, `createdAt`, `nitMasked` (`****268-4`). Sin email ni NIT completo |
| `PATCH` | `/admin/juridica/:id/verify` | Body `{ verified: boolean }`. Escribe `verification_events` (`actor_id`, `target_user_id`, `verified`, `created_at` — solo UUID). Si `verified = true`, email de aviso |
| `GET` | `/admin/privacy/deletion-requests` | Cursor (`limit`/`cursor`). Ítems: `id`, `userId`, `createdAt`. Sin PII |

Aviso: Resend si hay `RESEND_API_KEY` + `MAIL_FROM`; si no, log sin PII (no hay FCM: la cuenta aún no puede loguear). Fallback operativo: `npm run auth:verify-juridica -- <email>` (HMAC, no SQL con email en claro; **no** escribe auditoría ni manda mail).

Semilla admin (desde `backend/`):

```bash
npm run auth:create-admin -- ops@example.com 'a-strong-password'
```

### 4.4.1 Comunidad — contrato HTTP

Listados de marketplace. JWT de cualquier rol para buscar. Crear post o ficha pública: solo `NATURAL` / `JURIDICA` (`ADMIN` → `403`). Sin token → `401`. El perfil público **no** lleva teléfono, email ni NIT.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `GET` | `/posts/search?q=&limit=` | JWT | Ítems ranqueados (`ts_rank_cd` + `similarity` / `word_similarity`). `q` 1–100 chars. `limit` default 20, max 50 |
| `POST` | `/posts` | NATURAL, JURIDICA | `{ title, description, category }` → 201 |
| `GET` | `/profiles/search?q=&limit=` | JWT | Fichas públicas ranqueadas (nombre comercial, municipio, rubro, bio) |
| `PUT` | `/profiles/me` | NATURAL, JURIDICA | Upsert de la ficha pública del `sub` |

Índice FTS: columna generada `search_vector` (config `spanish_unaccent`) + GIN `pg_trgm` sobre texto `unaccent`. Extensiones `unaccent` y `pg_trgm` (migración). Target: < 200 ms con ≥ 5.000 posts.

Matching productor/comprador y mensajería siguen previstos; no hay endpoints de hilos ni de match.

### 4.4.2 Commodities — contrato HTTP

Precio vigente (un row por `producto`+`region`, COP). JWT de cualquier rol para consultar. Escribir: solo `JURIDICA` con `verified = true` en Postgres (se relee; el access token no basta si el operador desactivó la cuenta). Sin token → `401`. NATURAL / ADMIN en POST → `403`. Labels se normalizan (trim, minúsculas, espacios colapsados): `Papa criolla` y `papa  criolla` son la misma clave.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/commodities/precios` | JURIDICA verificada | Body `{ producto, region, precio, unidad? }`. Upsert. `unidad` default `kg`. `moneda` siempre `COP`. 200 |
| `GET` | `/commodities/precios?producto=&region=` | JWT | Precio vigente. Cache Redis TTL **60 s**. `cached: true` si vino de cache. Sin fila → `404`. Ambos query params obligatorios |

Cache: `GET` Redis → miss → Postgres → `SET` 60 s. POST hace `DEL` de esa clave. Si Redis falla, GET lee Postgres (fail-open; la fuente de verdad no es el cache). OTP/refresh siguen fail-closed.

Instrumentación Upstash (10.000 cmds/día): contador **en proceso** (no un `INCR` extra). `GET /health` incluye `{ redis: { ops, day, limit: 10000 } }` (`day` UTC). Pino avisa al 80 % y al tope. Throttle + KV (OTP, refresh, cache de precios) suman al mismo meter.

### 4.4.3 Notifications — contrato HTTP (AG-24)

Push nativo Android vía FCM HTTP v1. El módulo es **global**: Comunidad y Commodities inyectan `NotificationService` y llaman `send(userId, payload)` sin HTTP. No hay endpoint para disparar un push a otro usuario. ADMIN no usa la app rural; `POST /auth/login/admin` no acepta `fcmToken`.

JWT de cualquier rol autenticado. Sin token → `401`. `fcmToken` no es PII de Ley 1581; igual se redacta en logs y no se devuelve en respuestas.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `PUT` | `/notifications/devices` | JWT | Body `{ fcmToken, deviceId }`. Upsert por (`userId`, `deviceId`). Un token que ya existía en otro usuario se mueve. Reintenta FCM de la cola `PENDING`. `{ registered: true }` |
| `DELETE` | `/notifications/devices` | JWT | Body `{ deviceId }`. Baja el token de ese dispositivo. `{ revoked: true }` |
| `GET` | `/notifications/pending` | JWT | Inbox `PENDING` **y** `SENT` no acked (hasta 50, máx. 28 días). `{ items: [{ id, title, body, data, createdAt }] }`. `SENT` = FCM aceptó, no que el usuario lo viera. El cliente deduce duplicados FCM con `data.notificationId` |
| `POST` | `/notifications/pending/ack` | JWT | Body `{ ids: uuid[] }`. Único paso a `DELIVERED`. `{ acked: n }` |

`send(userId, { title, body, data? })`: siempre inserta en `notifications`. Si hay token y FCM acepta → `SENT` (FCM guarda hasta 28 días si el teléfono está sin red). Si no hay token o FCM no responde → `PENDING`; al reconectar el cliente registra el token (login o `PUT /devices`) y/o lee `GET /pending`. Tokens se borran solo con `UNREGISTERED`, `NOT_FOUND` o `SENDER_ID_MISMATCH`. Un HTTP 400 / `INVALID_ARGUMENT` genérico no limpia el token (`unavailable`). Sin credenciales Firebase, el cliente HTTP no se usa (log) y todo queda `PENDING` (inbox). No usa Redis (no suma al cupo Upstash).

Login NATURAL / JURIDICA: `fcmToken` y `deviceId` van juntos o no van. El bind FCM es fire-and-forget: no bloquea el JWT. Un bind fallido no revierte el JWT.

### 4.5 Datos (Ley 1581)

Tabla `users`: plaintext de teléfono / email / NIT **nunca** se guarda. Ciphertext `pgcrypto` AES-256 (`pgp_sym_encrypt`); lookup HMAC-SHA256 con `PII_HASH_PEPPER`. Constraints: NATURAL exige teléfono; JURIDICA exige email+NIT+`entity_type`; ADMIN exige email y no lleva NIT ni `entity_type`.

Consentimiento explícito (AG-41): `privacy_policy_version` + `privacy_policy_accepted_at` se escriben en el alta NATURAL (`POST /auth/otp/verify`) y JURIDICA (`POST /auth/register/juridica`) si `acceptPrivacyPolicy === true`. El primer timestamp gana (no se pisa en OTP posteriores). ADMIN sembrado no pasa por este flujo. Política vigente: constante `PRIVACY_POLICY_VERSION` y markdown en `src/legal/privacy-policy.md`.

Tabla `verification_events`: solo UUIDs y booleano. Sin PII.

Tabla `deletion_requests`: `user_id` único (solicitud de supresión). El MVP no ejecuta el borrado; el operador usa `GET /admin/privacy/deletion-requests` y cumple a mano.

Tablas `posts` y `marketplace_profiles`: listados públicos (título, rubro, municipio, bio). Sin PII. FTS en columna generada `search_vector` + índices GIN `pg_trgm` (extensiones `unaccent`, `pg_trgm`).

Tabla `commodity_prices`: `producto` + `region` únicos, `precio` COP, `unidad`, `reported_by` (UUID). Sin PII.

Tablas `device_tokens` y `notifications`: token FCM + inbox de push. Sin teléfono/email/NIT. `ON DELETE CASCADE` con `users`. Estados: `PENDING` \| `SENT` \| `DELIVERED`.

Logs: Pino redacta `email`, `password`, `nit`, `phone`, `code`, tokens, `fcmToken`, claves.

### 4.6 Principios API

- Payloads mínimos (claves cortas en endpoints frecuentes)
- Paginación cursor-based en listados (`limit` + `cursor`)
- Gzip/Brotli en todas las respuestas
- Target latencia: < 200 ms
- Production sin Redis: KV fail-closed (OTP/refresh no fingen éxito)

---

## 5. Infraestructura — Free Tier (Fase MVP)

| Capa | Servicio | Límite a monitorear |
|---|---|---|
| Backend NestJS | Render | 750 h/mes · sleep 15 min → cron ping 10 min |
| PostgreSQL | Supabase | 500 MB almacenamiento |
| Redis | Upstash | **10.000 requests/día** · meter en `GET /health` → `redis.ops` |
| Archivos PDF/Audio | Cloudflare R2 | 10 GB · 1 M lecturas/mes (GuiasModule, aún no) |
| OTP SMS | Firebase Authentication | 10.000 SMS/mes |
| Email/password | Firebase Authentication | JURIDICA + ADMIN |
| Email transaccional | Resend | Aviso “cuenta verificada” (AG-17) |
| Push | Firebase FCM HTTP v1 | Gratuito; `NotificationsModule`. Noticias (contenido) no implementado |
| Anti-sleep | Cron-job.org → `GET /health` cada 10 min | — |
| Backups PG | GitHub Actions → R2 `backups/postgres/` | retención 7 días; Free no tiene PITR |

**Punto de migración:** al superar ~500 usuarios activos concurrentes → Render pago (sin spin-down) + Supabase Pro + Upstash Pro. El código NestJS no cambia.

---

## 6. Seguridad y cumplimiento

- **Ley 1581 (Habeas Data):** consentimiento explícito (`acceptPrivacyPolicy`) en registro NATURAL y JURIDICA, con versión de política + timestamp. Teléfono, NIT y email cifrados en reposo (pgcrypto AES-256). Lookup por HMAC. Nunca en logs ni en respuestas de `/admin/juridica/pending` (NIT enmascarado) ni de `/admin/privacy/deletion-requests`. Dumps de Postgres en R2 (`backups/`) son PII; bucket privado. El titular pide supresión con `POST /auth/privacy/deletion-request`.
- **JWT:** RS256. TTL por rol (§ 4.3). Un refresh vivo por usuario; rotación con `GETDEL`; logout borra refresh e índice de sesión (`deviceId` opcional, best-effort). Refresh de JURIDICA relee `verified`.
- **Privilegios:** no existe `POST /auth/register/admin`. Un API key compartido no identifica operador; el audit usa `sub` del JWT ADMIN.
- **Rate limiting:** Throttle por IP vía Redis (Upstash); OTP y registro JURIDICA tienen límites más estrictos en el controller. El cupo diario de 10.000 comandos se ve en `GET /health` → `redis.ops` (UTC).
- **OWASP:** Helmet, ValidationPipe global (`whitelist` + `forbidNonWhitelisted`), sanitización de inputs.
- Render inyecta `PORT`. No definirlo en el dashboard.

---

## 7. Estrategia offline-first

Previsto para el cliente Flutter + `SyncModule` (aún no hay endpoint `/sync`):

```
Usuario sin señal → Opera con SQLite local
                  → Cola de operaciones con timestamp local
Al recuperar señal → POST /sync con batch de operaciones
                   → Backend aplica Last-Write-Wins (ventana 5min)
                   → Responde con delta de cambios del servidor
```

Ningún endpoint crítico de producto (precios, ofertas, contactos) deberá exigir conexión en tiempo real cuando existan. Auth (OTP / login) sí requiere red.

---

## 8. Modelo de negocio Marketplace

**Decisión: Modelo A — Directorio con contacto (sin pagos en plataforma)**

### Flujo

```
Productor paga suscripción mensual → Aparece listado en el marketplace
Comprador descubre y contacta      → Negocian por mensajería interna
Pago ocurre por fuera              → Nequi · Daviplata · Transferencia bancaria
Plataforma no intermedia el dinero → Sin riesgo regulatorio financiero
```

### Revenue model MVP

- Suscripción mensual del productor (NATURAL y JURIDICA) por estar listado
- La plataforma no cobra comisión por transacción en Fase 1
- ADMIN no es un rol de marketplace (no paga ni se lista)

### Comunicación entre usuarios

- Mensajería directa interna → ComunidadModule (previsto)
- Canal: productor ↔ comprador negocian precio, cantidad y logística
- Pago: fuera de la plataforma vía Nequi / Daviplata / transferencia

### Por qué no Modelo B (comisión por transacción) en MVP

- Requiere registro ante Superintendencia Financiera de Colombia
- Cumplimiento SARLAFT (prevención lavado de activos)
- Integración PSE / Wompi / PayU con obligaciones tributarias complejas
- Inviable en fase de validación

### Punto de migración a Modelo B

Cuando se documenten más de 500 transacciones/mes fuera de la plataforma → integrar Wompi (Bancolombia) → activar comisión. El historial de negociaciones en ComunidadModule será la evidencia.

---

## 9. Cómo mantener esta guía

Al cerrar un cambio de producto o de contrato HTTP:

1. Actualizar **este archivo** en el mismo PR (roles, endpoints, TTL, módulos implementados vs previstos).
2. Si el cambio es de consola/secretos, también [`infra/PROVISIONING.md`](../infra/PROVISIONING.md).
3. No introducir un segundo host. Tickets que pidan Railway u otro PaaS se implementan contra Render.
4. No tratar `entity_type` / `empresa` como rol. No abrir registro público de `ADMIN`.
