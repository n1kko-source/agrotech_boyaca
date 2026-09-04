# AgroTech Boyacá — Contexto arquitectónico

> Guía base del proyecto. **El código en este repo manda.** Si un ticket Jira contradice lo implementado, se sigue el código y se actualiza este archivo en el mismo cambio.
> Host backend: **Render** · Última alineación: auth NATURAL / JURIDICA / ADMIN, consentimiento Ley 1581 (AG-41), `AdminModule`, FTS de comunidad (AG-21), CRUD HTTP de posts (AG-20), precios de commodities (AG-23), push FCM (AG-24), clima/alertas (AG-25), guías técnicas PDF/audio (AG-26), login Flutter ramificado (AG-19), mensajería 1:1 (AG-22), sync offline LWW (AG-27), persistencia SQLite del cliente (AG-28), suscripción mensual de listado (AG-29), hardening OWASP + auditoría de cifrado (AG-30) y pantallas Flutter de comunidad (AG-35).

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
- Offline-first con SQLite local (`sqflite`) — posts, fotos locales del anuncio, precios cacheados, mensajes, perfil y cola `pending_ops` (AG-28). Tokens de sesión en `flutter_secure_storage` (AG-19)
- Sincronización con backend al recuperar señal vía `POST /sync` (AG-27: batch + LWW). El cliente encola, dispara el POST y aplica el delta (AG-28)
- Push notifications nativas vía FCM (`NotificationsModule`; módulo de noticias no implementado)
- **Fase 2:** mismo codebase Flutter compila para iOS sin reescritura
- PWA descartada: Service Workers poco confiables en 2G/3G rural

### 3.1 Cliente Flutter — Auth (AG-19)

Código en `mobile/`. ADMIN no aparece en la app rural.

| Pieza | Contrato |
|---|---|
| Rol | Pantalla NATURAL vs JURIDICA. `empresa` es `entityType`, nunca un rol |
| NATURAL | Celular E.164 `+573XXXXXXXXX` → OTP 6 dígitos. Reenvío con countdown **60 s** (`OTP_COOLDOWN_SECONDS`). Consentimiento Ley 1581 en el verify |
| JURIDICA | Registro `{ email, password, nit, entityType, acceptPrivacyPolicy }` y login `{ email, password }` |
| Pendiente | Login `403 FORBIDDEN` o registro `201` → pantalla de espera (correo Firebase y/o `verified` de operador). Reenvío: `POST /auth/register/juridica/resend` |
| Tokens | Access + refresh en `flutter_secure_storage` (EncryptedSharedPreferences / Keychain). No se persiste teléfono, correo, NIT ni contraseña. FLAG_SECURE en pantallas OTP/password (no recents) |
| Refresh | Transparente: si el access vence en ≤ 30 s, o ante `401`, un solo `POST /auth/refresh` en vuelo (mutex; el backend usa `GETDEL`). Si falla → invitado |
| API | `API_BASE_URL` (`--dart-define`). Default `https://agrotech-8p9b.onrender.com`. Timeout 20 s. Release exige HTTPS; debug puede usar `http://10.0.2.2:3000`. Android: `allowBackup=false`, cleartext off en release |

### 3.2 Cliente Flutter — Sync offline (AG-28)

Código en `mobile/lib/sync/`. Solo corre con sesión NATURAL / JURIDICA (la app rural no tiene ADMIN).

| Pieza | Contrato |
|---|---|
| SQLite | Archivo `agrotech.db` (`sqflite`). Esquema espejo: `posts`, `marketplace_profiles`, `conversations`, `messages`, `commodity_prices`, `weather_alerts` + cola `pending_ops` + `sync_meta` (`since` por `userId`) + `post_photos` (JPEG locales del anuncio, AG-35; no van en `/sync`) |
| Cola | Cada escritura offline: `opId` UUID v4, `entityId` UUID v4, `clientTs` reloj local ISO-8601. Escritura optimista y fila de cola en la misma transacción. Padres antes que hijos (`conversation` antes que `message`) |
| Batch | Máx. **50** ops por `POST /sync`. `since` = último `serverTime` de ese usuario. Sin cola y sin `since` no hay POST (no se vuelca el mundo en 2G) |
| Señal | `connectivity_plus`: radio `none` → no POST y se cancela el timer. Al pasar a con enlace, al escribir con red, o al volver a primer plano → `POST /sync`. Un solo flush en vuelo. Si el POST falla (timeout / 5xx / 429) y el radio sigue arriba, reintento 5s → 15s → 45s (tope 45s). 400/403 no vacían la cola ni martillan: un reintento al tope de 45s o al resume. Éxito o escritura nueva reinician la serie |
| Delta | Upsert local de `posts`, ficha, hilos, mensajes y alertas. `applied`/`conflict`/`rejected` salen de la cola. `conflict` aplica `record`. `rejected` sin `record` revierte el optimista. Los precios globales no vienen en el delta: se cachean al encolar un `precio` o al guardar un `GET /commodities/precios` |
| UI | Banner en home: **Sin conexión** (sin radio) / **Sincronizando…** (flush, backoff o cola > 0) / **Sincronizado** (radio y cola vacía) |

### 3.3 Cliente Flutter — Comunidad (AG-35)

Código en `mobile/lib/comunidad/`. Consume AG-20 / AG-21 / AG-28. El modelo HTTP de post sigue siendo `{ title, description, category }` (sin fotos ni precio en Postgres).

| Pieza | Contrato |
|---|---|
| Home/Feed | Lista cursor (`GET /posts` al haber radio; SQLite si no). Pull-to-refresh dispara `POST /sync` y recarga. Offline sirve la página local |
| Detalle | `GET /posts/:id` con fallback SQLite. Muestra producto, cantidad, precio, ubicación (campos de oferta embebidos en `description`) y fotos locales. **Contactar** encola `conversation` (AG-22 / AG-28). El autor ve **Editar** |
| Alta/edición | Misma cola `pending_ops` de AG-28 (create o update LWW). Cantidad / precio / ubicación se serializan en `description` para FTS. Fotos: `image_picker` las comprime (1280 px, JPEG 70) **antes** de persistir; viven en SQLite `post_photos` (el body de `/sync` no admite media y el DTO de AG-20 no tiene fotos) |
| Búsqueda | `GET /posts/search?q=` (AG-21). Sin radio, filtra el cache SQLite. Estado **sin resultados** explícito |

Auth (OTP / login) sigue exigiendo red. No se persisten teléfono, correo, NIT ni contraseña en SQLite.

---

## 4. Backend

**Framework:** NestJS (TypeScript) — monolito modular (no microservicios en v1).

**Justificación monolito:** evita latencia inter-servicio bajo 2G/3G, reduce complejidad operativa en fase MVP, extractable a microservicios cuando la carga lo justifique.

Entry: `AppModule` importa `SharedModule`, `PrismaModule`, `NotificationsModule`, `AuthModule`, `AdminModule`, `ComunidadModule`, `CommoditiesModule`, `ClimaModule`, `GuiasModule`, `SyncModule`, `SuscripcionesModule`.

### 4.1 Módulos — implementados

| Módulo | Responsabilidad |
|---|---|
| SharedModule | Kernel: JWT RS256, `JwtAuthGuard` + `RolesGuard` globales, throttle Redis, Pino (redact PII), Helmet, ValidationPipe, cursor pagination, `GlobalExceptionFilter` |
| PrismaModule | Postgres (Supabase). `DATABASE_URL` pooler `:6543`; `DIRECT_URL` session `:5432` para migraciones/backups |
| AuthModule | OTP NATURAL · registro/login JURIDICA · login ADMIN · issue/revoke refresh (una sesión por usuario) · `GET /auth/me` |
| AdminModule | Operador: listar JURIDICA pendientes · `PATCH` verify · auditoría UUID · email de aviso · registro de pago de suscripción (AG-29) |
| ComunidadModule | Posts de marketplace · perfiles públicos · FTS PostgreSQL · mensajería 1:1 (`/conversaciones`) con historial persistente y push FCM. Matching aún no. Listado público filtra por suscripción activa/en_gracia |
| CommoditiesModule | Precio vigente COP por producto+región · cache Redis TTL 60 s · invalidación al upsert. Solo JURIDICA verificada escribe |
| NotificationsModule | FCM HTTP v1 · registro de token por dispositivo · `NotificationService.send(userId, payload)` (global, lo inyectan Comunidad/Commodities/Clima/Suscripciones) · inbox Postgres si el dispositivo está offline · limpieza de tokens inválidos |
| ClimaModule | OpenWeather (current + forecast 5d/3h) por municipio · cache Redis TTL 3 h · alertas `rain`/`frost` · job HTTP → `NotificationService` · WebSocket `/clima` complementario (no sustituye al push) |
| GuiasModule | Metadata PDF/audio · upload ADMIN a R2 (`guias/`) · listado cursor · stream con Range · audio Opus 16 kbps · meter en `/health` |
| SyncModule | `POST /sync` · batch offline (máx. 50 ops) · LWW con ventana de skew 5 min · delta user-scoped |
| SuscripcionesModule | Gate de listado (AG-29): `currentPeriodEnd` derivado a `activa`/`en_gracia`/`vencida` · pago admin fuera de plataforma · job HTTP diario + push |

### 4.2 Módulos — previstos (aún no hay código)

| Módulo | Responsabilidad |
|---|---|
| NoticiasModule | Contenido de noticias (el clima, las alertas y el push FCM ya viven en `ClimaModule` / `NotificationsModule`) |

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

Listados de marketplace. JWT de cualquier rol para el feed, buscar y para `GET /posts/:id`. Crear/editar/borrar post o ficha pública: solo `NATURAL` / `JURIDICA` (`ADMIN` → `403`). Sin token → `401`. El perfil público **no** lleva teléfono, email ni NIT. Search y feed de posts **omite** autores `vencida` (AG-29); el DTO no expone gracia. `GET /posts/:id` deja ver al dueño su anuncio aunque esté `vencida`; otro visor (incl. ADMIN) solo si el autor está listado (`activa` / `en_gracia`). Inexistente o no listable para el visor → `404` (nunca `403`: no se filtra existencia).

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `GET` | `/posts?limit=&cursor=` | JWT | Feed cursor (`createdAt` DESC). Solo autores listados (`activa` / `en_gracia`). `{ items, nextCursor }`. Sin token → `401`. DTO sin gracia |
| `GET` | `/posts/search?q=&limit=` | JWT | Ítems ranqueados (`ts_rank_cd` + `similarity` / `word_similarity`). `q` 1–100 chars. `limit` default 20, max 50 |
| `GET` | `/posts/:id` | JWT | `PostView` `{ id, authorId, title, description, category, createdAt }`. Dueño: siempre. Otro: solo si el autor está listado. Sin fila o no listable → 404. DTO sin `en_gracia` ni badge |
| `POST` | `/posts` | NATURAL, JURIDICA | `{ title, description, category }` → 201 |
| `PATCH` | `/posts/:id` | NATURAL, JURIDICA (autor) | Body = create `{ title, description, category }`. Extraño o inexistente → 404. `ADMIN` → 403 |
| `DELETE` | `/posts/:id` | NATURAL, JURIDICA (autor) | 204. Extraño o inexistente → 404. `ADMIN` → 403. Postgres `ON DELETE CASCADE` limpia `conversations` / `messages` del post |
| `GET` | `/profiles/search?q=&limit=` | JWT | Fichas públicas ranqueadas (nombre comercial, municipio, rubro, bio) |
| `PUT` | `/profiles/me` | NATURAL, JURIDICA | Upsert de la ficha pública del `sub` |
| `POST` | `/conversaciones` | NATURAL, JURIDICA | Body `{ postId }`. Abre un hilo 1:1 con el autor del post. Idempotente: mismo `postId`+iniciador → 200 con el mismo `id` (incluye carrera 2G: unique + relectura). Autor no puede abrir hilo consigo mismo → `400`. Post inexistente → `404`. `ADMIN` → `403` |
| `POST` | `/conversaciones/:id/mensajes` | NATURAL, JURIDICA (participantes) | Body `{ body }` 1–500 chars, sin adjuntos. 201. Push FCM + inbox al otro participante. Extraño → `404` |
| `GET` | `/conversaciones/:id/mensajes` | NATURAL, JURIDICA (participantes) | Cursor (`limit`/`cursor`), más recientes primero. `{ items, nextCursor }`. Extraño → `404` |

Índice FTS: columna generada `search_vector` (config `spanish_unaccent`) + GIN `pg_trgm` sobre texto `unaccent`. Extensiones `unaccent` y `pg_trgm` (migración). Target: < 200 ms con ≥ 5.000 posts.

Matching productor/comprador sigue previsto; no hay endpoint de match. Mensajería: un hilo por (`postId`, iniciador). Un retry concurrente no duplica el hilo: unique `(postId, initiatorId)` + relectura → 200. No hay `GET /conversaciones` (bandeja) en este corte. El historial en `messages` es la evidencia de negociación para métricas de Modelo B (§ 8). El push usa `NotificationService.send` (título `Nuevo mensaje`, preview ≤ 80 chars, `data.conversationId` / `messageId` / `postId`). El texto del mensaje no es PII de Ley 1581; igual se redacta `req.body.body` en logs.

### 4.4.2 Commodities — contrato HTTP

Precio vigente (un row por `producto`+`region`, COP). JWT de cualquier rol para consultar. Escribir: solo `JURIDICA` con `verified = true` en Postgres (se relee; el access token no basta si el operador desactivó la cuenta). Sin token → `401`. NATURAL / ADMIN en POST → `403`. Labels se normalizan (trim, minúsculas, espacios colapsados): `Papa criolla` y `papa  criolla` son la misma clave.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/commodities/precios` | JURIDICA verificada | Body `{ producto, region, precio, unidad? }`. Upsert. `unidad` default `kg`. `moneda` siempre `COP`. 200 |
| `GET` | `/commodities/precios?producto=&region=` | JWT | Precio vigente. Cache Redis TTL **60 s**. `cached: true` si vino de cache. Sin fila → `404`. Ambos query params obligatorios |

Cache: `GET` Redis → miss → Postgres → `SET` 60 s. POST hace `DEL` de esa clave. Si Redis falla, GET lee Postgres (fail-open; la fuente de verdad no es el cache). OTP/refresh siguen fail-closed.

Instrumentación Upstash (10.000 cmds/día): contador **en proceso** (no un `INCR` extra). `GET /health` incluye `{ redis: { ops, day, limit: 10000 } }` (`day` UTC). Pino avisa al 80 % y al tope. Throttle + KV (OTP, refresh, cache de precios, cache de clima) suman al mismo meter.

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

### 4.4.4 Clima y alertas — contrato HTTP (AG-25)

Pronóstico por municipio (Boyacá primero vía geocoding OpenWeather) y umbrales configurables. El canal de entrega en 2G/3G es **FCM + inbox** (`NotificationService.send`). El WebSocket `namespace /clima` es opt-in (JWT en `auth.token` o `Authorization`); no sustituye al push ni al GET pending.

JWT de cualquier rol para consultar clima. Crear/listar alertas: `NATURAL` / `JURIDICA` (`ADMIN` → `403`). Sin token → `401`. Sin `OPENWEATHER_API_KEY` → `503` en GET clima. Redis fail-open (TTL **3 h**); si Redis cae se llama a OpenWeather. Fetch a OpenWeather: timeout **5 s** (`AbortSignal`). No usa NLP: el umbral es `kind`.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `GET` | `/clima/:municipio` | JWT | Clima actual + 8 slots de forecast (~24 h). `{ municipio, current, forecast, fetchedAt, cached }`. Municipio 2–80 chars. Desconocido → `404` |
| `POST` | `/alertas` | NATURAL, JURIDICA | Body `{ municipio, kind: "rain" \| "frost", enabled? }`. Upsert por (`userId`, municipio, kind). `{ id, municipio, kind, enabled }` |
| `GET` | `/alertas` | NATURAL, JURIDICA | Alertas del `sub`. `{ items: [...] }` |
| `POST` | `/clima/jobs/evaluate` | header `x-clima-job-secret` = `CLIMA_JOB_SECRET` | Público (cron). Agrupa por municipio, reusa el cache, dispara push si el umbral matchea y no se disparó en 12 h. `{ evaluated, fired }`. Secret inválido → `401` |

`rain`: id OpenWeather 2xx/3xx/5xx, `pop ≥ 0.4` o `rainMm > 0` en actual o forecast. `frost`: `tempC ≤ 2`. Job: cron-job.org cada **3 h** (no `@Cron` in-process: Render Free hiberna). WS evento `alerta` al mismo payload que el push.

### 4.4.5 Guías técnicas — contrato HTTP (AG-26)

PDF y audio para el productor rural (2G/3G). Metadata en Postgres; bytes en Cloudflare R2 prefijo `guias/` (el mismo bucket que `backups/postgres/`, bucket **privado**). El listado no trae el archivo. La descarga va por la API con JWT (no hay URL pública) y honra `Range` para descarga progresiva. Audio se recodifica a **Opus 16 kbps, mono, 16 kHz** (`audio/ogg`) con ffmpeg **antes** de `PutObject`. PDF se guarda tal cual (`application/pdf`, máx. 8 MB). Audio de entrada máx. 30 MB.

JWT de cualquier rol para listar/descargar. Escribir: solo `ADMIN`. Sin token → `401`. NATURAL / JURIDICA en POST/PATCH/DELETE → `403`. Sin `R2_*` en producción → `503` al subir. Gzip/Brotli **no** se aplica al stream del archivo (rompería Range).

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/guias` | ADMIN | multipart: `archivo` + `titulo`, `categoria`, `subsector`. 201 `{ id, titulo, categoria, subsector, kind, mimeType, sizeBytes, createdAt }`. `kind` = `pdf` \| `audio` (se infiere del MIME). `categoria`/`subsector` se normalizan (trim, minúsculas) |
| `GET` | `/guias?categoria=&limit=&cursor=` | JWT | Cursor. Ítems = metadata (sin bytes). `categoria` opcional |
| `GET` | `/guias/:id` | JWT | Metadata. Sin fila → `404` |
| `GET` | `/guias/:id/archivo` | JWT | Stream. `Accept-Ranges: bytes`. `Range: bytes=start-end` → `206` + `Content-Range`. Rango inválido → `416`. Cuenta 1 lectura R2 (Class B) |
| `PATCH` | `/guias/:id` | ADMIN | Body `{ titulo?, categoria?, subsector? }` (al menos un campo). No reemplaza el archivo |
| `DELETE` | `/guias/:id` | ADMIN | Borra objeto R2 + fila. 204 |

`GET /health` incluye `{ r2: { storageBytes, storageLimit: 10737418240, reads, readsLimit: 1000000, month } }`. `storageBytes` es la suma de guías (no incluye dumps de backup en el mismo bucket). `reads` son GetObject de `/archivo` en el mes UTC; Pino avisa al 80 % y al tope. El 10 GB / 1 M lecturas es el free tier del **bucket entero**.

### 4.4.6 Sync offline — contrato HTTP (AG-27)

Cola de escrituras del cliente rural (2G/3G). JWT `NATURAL` / `JURIDICA`. `ADMIN` → `403`. Sin token → `401`. El batch **no es atómico**: un op `rejected`/`conflict` no aborta los demás. HTTP 200 si el body es válido. Payload inválido a nivel DTO → `400`. Throttle 20 req/min.

Cada op lleva `opId` (UUID v4, idempotencia de retry 2G) y `entityId` (UUID v4 generado en el dispositivo). `clientTs` es el reloj local de la escritura, no el de llegada al server.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/sync` | NATURAL, JURIDICA | Body `{ since?: ISO-8601, ops?: SyncOp[] }`. `ops` máx. **50**. 200 `{ serverTime, results, delta }` |

`SyncOp`: `{ opId, entity, entityId, clientTs, payload }`.

`entity`: `post` \| `profile` \| `conversation` \| `message` \| `alerta` \| `precio`.

`payload` reusa el contrato del endpoint de escritura (post: `{ title, description, category }`; profile: ficha pública; conversation: `{ postId }`; message: `{ conversationId, body }`; alerta: `{ municipio, kind, enabled? }`; precio: `{ producto, region, precio, unidad? }`).

`results[]`: `{ opId, entity, entityId, status, reason?, record? }`. `status`: `applied` \| `conflict` \| `rejected`. El mismo `opId` replayed devuelve el resultado original (idempotente). `conflict` incluye `record` con la versión que ganó en server. `precio` desde NATURAL → `rejected` (`Forbidden`); JURIDICA no verificada igual.

**LWW (ventana 5 min):** se compara `clientTs` contra el reloj de sync de esa entidad (`sync_clocks`), no contra `updatedAt` de Postgres (ese es el instante de apply). Gana el `clientTs` estrictamente mayor. Un `clientTs` más de **5 minutos en el futuro** → `rejected` (skew). Un timestamp de hace horas (cola offline) **sí aplica**. Creates append-only (`conversation`, `message`) no usan LWW: son idempotentes por `entityId`.

**Delta:** user-scoped, exclusivo sobre `since` (el cliente guarda `serverTime`). Sin `since` → colecciones vacías (no se vuelca el mundo en 2G). Tope 50 ítems por colección. Incluye posts propios, ficha si cambió, hilos/mensajes donde el `sub` participa, alertas propias. No incluye el listado global de precios (sigue `GET /commodities/precios`).

Orden: el cliente debe encolar padres antes que hijos (conversación antes que mensaje). El server procesa `ops` en orden.

### 4.4.7 Suscripciones — contrato HTTP (AG-29)

Gate de listado público (Modelo A). JWT. `ADMIN` no se lista ni se suscribe. El productor **escribe** posts/perfiles/sync sin pagar; `GET /posts/search` y `GET /profiles/search` solo incluyen autores `activa` o `en_gracia`. `GET /posts/:id` aplica el mismo filtro a visores ajenos; el dueño sí lee su anuncio `vencida`. El DTO público **no** lleva `en_gracia` ni badge. Sin fila = `vencida`. Periodo **30 días UTC**. Gracia **4 días**. Status **derivado** de `currentPeriodEnd` (el job no oculta filas).

`newEnd = max(now, currentPeriodEnd) + 30d`. Un pago resetea los flags de reminder.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `GET` | `/suscripciones/me` | NATURAL, JURIDICA | `{ status, currentPeriodEnd, graceEndsAt }`. Sin fila: `vencida` y fechas `null`. `ADMIN` → `403` |
| `POST` | `/admin/suscripciones/:userId/pagos` | ADMIN | Body `{ channel: "nequi" \| "daviplata" \| "transferencia", reference? }`. Target NATURAL/JURIDICA. 200 con la vista de suscripción. Misma `reference` → `409`. ADMIN target → `400`. Sin usuario → `404` |
| `POST` | `/suscripciones/jobs/evaluate` | header `x-suscripciones-job-secret` | Público (cron diario). Push idempotente por periodo: (a) 3 días antes, (b) entra gracia, (c) se oculta. `{ evaluated, fired }`. Secret inválido → `401` |

Ops/demo (no es HTTP): `npm run suscripciones:grant -- <userId>` extiende 30 días sin fila de pago.

Tablas `subscriptions` y `subscription_payments`: UUID + canal + `reference` opaca. Sin PII. `ON DELETE CASCADE` con `users`.

### 4.5 Datos (Ley 1581)

Tabla `users`: plaintext de teléfono / email / NIT **nunca** se guarda. Ciphertext `pgcrypto` AES-256 (`pgp_sym_encrypt`); lookup HMAC-SHA256 con `PII_HASH_PEPPER`. Constraints: NATURAL exige teléfono; JURIDICA exige email+NIT+`entity_type`; ADMIN exige email y no lleva NIT ni `entity_type`.

Consentimiento explícito (AG-41): `privacy_policy_version` + `privacy_policy_accepted_at` se escriben en el alta NATURAL (`POST /auth/otp/verify`) y JURIDICA (`POST /auth/register/juridica`) si `acceptPrivacyPolicy === true`. El primer timestamp gana (no se pisa en OTP posteriores). ADMIN sembrado no pasa por este flujo. Política vigente: constante `PRIVACY_POLICY_VERSION` y markdown en `src/legal/privacy-policy.md`.

Tabla `verification_events`: solo UUIDs y booleano. Sin PII.

Tabla `deletion_requests`: `user_id` único (solicitud de supresión). El MVP no ejecuta el borrado; el operador usa `GET /admin/privacy/deletion-requests` y cumple a mano.

Tablas `posts` y `marketplace_profiles`: listados públicos (título, rubro, municipio, bio). Sin PII. FTS en columna generada `search_vector` + índices GIN `pg_trgm` (extensiones `unaccent`, `pg_trgm`).

Tabla `commodity_prices`: `producto` + `region` únicos, `precio` COP, `unidad`, `reported_by` (UUID). Sin PII.

Tablas `conversations` y `messages`: hilo 1:1 anclado a un post (`post_id` + `initiator_id` únicos). Texto corto, sin adjuntos, sin PII de cuenta. `ON DELETE CASCADE` con `posts` y `users`.

Tablas `device_tokens` y `notifications`: token FCM + inbox de push. Sin teléfono/email/NIT. `ON DELETE CASCADE` con `users`. Estados: `PENDING` \| `SENT` \| `DELIVERED`.

Tabla `weather_alerts`: umbral `rain`/`frost` por usuario+municipio. Sin PII. `last_fired_at` evita re-push antes de 12 h.

Tabla `guias`: título, categoría, subsector, `kind` (`pdf`/`audio`), MIME, `size_bytes`, `object_key` (`guias/{uuid}.pdf|ogg`). Sin PII. Tabla `r2_monthly_reads`: lecturas Class B por mes UTC.

Tablas `sync_ops` y `sync_clocks`: log idempotente de ops offline (`op_id` cliente) y reloj LWW por entidad. UUID + JSON de resultado. Sin PII de cuenta. `ON DELETE CASCADE` con `users`. El texto de `messages` en `record` no es PII de Ley 1581; igual se redacta `req.body.ops[*].payload.body`.

Tablas `subscriptions` y `subscription_payments`: listado gated (AG-29). `current_period_end` es la fuente de verdad; status no se persiste. Pagos admin: UUID + canal + reference. Sin teléfono/email/NIT. `ON DELETE CASCADE` con `users`. Logs redactan `reference` y `SUSCRIPCIONES_JOB_SECRET`.

Logs: Pino redacta `email`, `password`, `nit`, `phone`, `code`, tokens, `fcmToken`, `OPENWEATHER_API_KEY`, `CLIMA_JOB_SECRET`, `R2_SECRET_ACCESS_KEY`, claves.

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
| Archivos PDF/Audio | Cloudflare R2 | 10 GB · 1 M lecturas/mes · meter en `GET /health` → `r2` |
| OTP SMS | Firebase Authentication | 10.000 SMS/mes |
| Email/password | Firebase Authentication | JURIDICA + ADMIN |
| Email transaccional | Resend | Aviso “cuenta verificada” (AG-17) |
| Push | Firebase FCM HTTP v1 | Gratuito; `NotificationsModule`. Noticias (contenido) no implementado |
| Clima | OpenWeather Current + 5 day / 3 hour | Free; cache Redis 3 h. `OPENWEATHER_API_KEY` |
| Anti-sleep | Cron-job.org → `GET /health` cada 10 min | — |
| Job alertas clima | Cron-job.org → `POST /clima/jobs/evaluate` cada 3 h | header `x-clima-job-secret` |
| Job suscripciones | Cron-job.org → `POST /suscripciones/jobs/evaluate` diario | header `x-suscripciones-job-secret` |
| Backups PG | GitHub Actions → R2 `backups/postgres/` | retención 7 días; Free no tiene PITR |

**Punto de migración:** al superar ~500 usuarios activos concurrentes → Render pago (sin spin-down) + Supabase Pro + Upstash Pro. El código NestJS no cambia.

---

## 6. Seguridad y cumplimiento

- **Ley 1581 (Habeas Data):** consentimiento explícito (`acceptPrivacyPolicy`) en registro NATURAL y JURIDICA, con versión de política + timestamp. Teléfono, NIT y email cifrados en reposo (pgcrypto AES-256). Lookup por HMAC. Nunca en logs ni en respuestas de `/admin/juridica/pending` (NIT enmascarado) ni de `/admin/privacy/deletion-requests`. Dumps de Postgres en R2 (`backups/`) son PII; bucket privado. El titular pide supresión con `POST /auth/privacy/deletion-request`.
- **Auditoría de cifrado (AG-30):** no hay columnas plaintext de teléfono/email/NIT. `PII_ENCRYPTION_KEY` y `PII_HASH_PEPPER` ≥ 32 caracteres; production rechaza el literal `dev-pepper` y aborta el boot si faltan. JWT RS256 con módulo RSA ≥ 2048 (fail-fast en production). OTP/InMemory solo usan fallback `dev-pepper` fuera de production.
- **JWT:** RS256 (`algorithms: ['RS256']` en verify). TTL por rol (§ 4.3). Un refresh vivo por usuario; rotación con `GETDEL`; logout borra refresh e índice de sesión (`deviceId` opcional, best-effort). Refresh de JURIDICA relee `verified`. Bearer solo en `Authorization`, nunca en query.
- **Privilegios:** no existe `POST /auth/register/admin`. Un API key compartido no identifica operador; el audit usa `sub` del JWT ADMIN.
- **Rate limiting:** Throttle por IP vía Redis (Upstash); OTP y registro JURIDICA tienen límites más estrictos en el controller. Production sin Redis: KV fail-closed. Throttle in-memory si no hay Redis (una instancia Render Free). El cupo diario de 10.000 comandos se ve en `GET /health` → `redis.ops` (UTC).
- **OWASP (AG-30):** Helmet explícito (CSP off — API JSON, no HTML; HSTS 180d). ValidationPipe global (`whitelist` + `forbidNonWhitelisted`) — eso es el filtrado de inputs, **no** un sanitizer HTML (no hay WebView ni panel admin). Body JSON **256 kb**. Upload de guías: magic `%PDF` + extensión `[a-z0-9]+`; audio inválido si ffmpeg falla → 400.
- **Android (AG-30):** `allowBackup=false` + reglas de extracción vacías; cleartext denegado en release (`networkSecurityConfig`); HTTPS obligatorio en `kReleaseMode`. FLAG_SECURE en OTP/login/registro. Sin certificate pinning ni detección de root (fuera de alcance).
- **Fuera de alcance:** CSRF (API Bearer, sin cookies de sesión), CORS (`enableCors` no se usa; WS `/clima` `origin: false`), pinning, SQLCipher, Sentry (AG-44), cupos SMS (AG-43).
- Render inyecta `PORT`. No definirlo en el dashboard.

---

## 7. Estrategia offline-first

Backend `POST /sync` (AG-27) y cliente Flutter SQLite + cola (AG-28) están implementados.

```
Usuario sin señal → Opera con SQLite local
                  → Cola de operaciones con timestamp local (clientTs) y UUID (opId, entityId)
Al recuperar señal → POST /sync con batch de operaciones (máx. 50)
                   → Si el POST falla y el radio sigue arriba, reintento 5s / 15s / 45s (no se finge “sin radio”)
                   → Backend aplica Last-Write-Wins (skew 5 min; cola de horas sí entra)
                   → Responde con results por op + delta user-scoped desde `since`
                   → Cliente guarda `serverTime` como próximo `since` y saca de la cola los applied
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
- Estados derivados: `activa` (hasta `currentPeriodEnd`) · `en_gracia` (4 días más, visible, sin badge al comprador) · `vencida` (sale del search)
- Pago fuera de plataforma; ADMIN lo registra en `POST /admin/suscripciones/:userId/pagos`
- Job HTTP diario dispara push (3 días antes / entra gracia / se oculta). No usa `@Cron` (Render Free hiberna)
- La plataforma no cobra comisión por transacción en Fase 1
- ADMIN no es un rol de marketplace (no paga ni se lista)

### Comunicación entre usuarios

- Mensajería directa interna → ComunidadModule (`POST /conversaciones`, mensajes + push)
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
