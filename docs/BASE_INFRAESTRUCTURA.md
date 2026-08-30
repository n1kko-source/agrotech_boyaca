# AgroTech Boyacá — Contexto arquitectónico

> Guía base del proyecto. **El código en este repo manda.** Si un ticket Jira contradice lo implementado, se sigue el código y se actualiza este archivo en el mismo cambio.
> Host backend: **Render** · Última alineación: auth NATURAL / JURIDICA / ADMIN + `AdminModule`.

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
- Push notifications nativas vía FCM (infra lista; módulo de noticias no implementado)
- **Fase 2:** mismo codebase Flutter compila para iOS sin reescritura
- PWA descartada: Service Workers poco confiables en 2G/3G rural

---

## 4. Backend

**Framework:** NestJS (TypeScript) — monolito modular (no microservicios en v1).

**Justificación monolito:** evita latencia inter-servicio bajo 2G/3G, reduce complejidad operativa en fase MVP, extractable a microservicios cuando la carga lo justifique.

Entry: `AppModule` importa `SharedModule`, `PrismaModule`, `AuthModule`, `AdminModule`.

### 4.1 Módulos — implementados

| Módulo | Responsabilidad |
|---|---|
| SharedModule | Kernel: JWT RS256, `JwtAuthGuard` + `RolesGuard` globales, throttle Redis, Pino (redact PII), Helmet, ValidationPipe, cursor pagination, `GlobalExceptionFilter` |
| PrismaModule | Postgres (Supabase). `DATABASE_URL` pooler `:6543`; `DIRECT_URL` session `:5432` para migraciones/backups |
| AuthModule | OTP NATURAL · registro/login JURIDICA · login ADMIN · issue/revoke refresh (una sesión por usuario) · `GET /auth/me` |
| AdminModule | Operador: listar JURIDICA pendientes · `PATCH` verify · auditoría UUID · email de aviso |

### 4.2 Módulos — previstos (aún no hay código)

| Módulo | Responsabilidad |
|---|---|
| ComunidadModule | Matching productor/comprador · Posts · Mensajería · FTS PostgreSQL |
| CommoditiesModule | Precios en tiempo real · Redis TTL agresivo |
| NoticiasModule | FCM push · WebSocket Gateway · Alertas · Clima |
| GuiasModule | PDF/Audio metadata · Entrega low-bandwidth (R2) |
| SyncModule | `POST /sync` · batch offline · conflicto LWW |

No implementar estos módulos “porque el ticket lo nombra” si el kernel de auth/admin no está cerrado. Extender este archivo cuando existan.

### 4.3 Auth — contrato HTTP

Público (`@Public()`), salvo `GET /auth/me`.

| Método | Ruta | Quién | Resultado |
|---|---|---|---|
| `POST` | `/auth/otp/send` | NATURAL | Envía OTP (Firebase o modo local). Rate limit estricto |
| `POST` | `/auth/otp/verify` | NATURAL | JWT 15 min + refresh 7 d |
| `POST` | `/auth/register/juridica` | JURIDICA | `{ email, password, nit, entityType }`. Firebase `signUp` + mail de verificación. Fila `verified = false`. Si Postgres falla tras Firebase → `accounts:delete` |
| `POST` | `/auth/register/juridica/resend` | JURIDICA | Reenvía oob de email |
| `POST` | `/auth/login/juridica` | JURIDICA | JWT 60 min + refresh 30 d. `403` si falta email Firebase o `verified` |
| `POST` | `/auth/login/admin` | ADMIN | JWT 60 min + refresh 7 d. Semilla CLI, no hay `POST /auth/register/admin` |
| `POST` | `/auth/refresh` | los tres | Rota el refresh con `GETDEL` (atómico). Un refresh vivo por usuario. Respeta TTL del **rol**. JURIDICA deja de rotar si `verified` pasa a `false` |
| `POST` | `/auth/logout` | los tres | Revoca el refresh actual y el índice de sesión en Redis |
| `GET` | `/auth/me` | JWT (cualquier rol autenticado) | `{ sub, role, entityType? }`. Sin `@Roles`: basta el Bearer |

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

Aviso: Resend si hay `RESEND_API_KEY` + `MAIL_FROM`; si no, log sin PII (no hay FCM: la cuenta aún no puede loguear). Fallback operativo: `npm run auth:verify-juridica -- <email>` (HMAC, no SQL con email en claro; **no** escribe auditoría ni manda mail).

Semilla admin (desde `backend/`):

```bash
npm run auth:create-admin -- ops@example.com 'a-strong-password'
```

### 4.5 Datos (Ley 1581)

Tabla `users`: plaintext de teléfono / email / NIT **nunca** se guarda. Ciphertext `pgcrypto` AES-256 (`pgp_sym_encrypt`); lookup HMAC-SHA256 con `PII_HASH_PEPPER`. Constraints: NATURAL exige teléfono; JURIDICA exige email+NIT+`entity_type`; ADMIN exige email y no lleva NIT ni `entity_type`.

Tabla `verification_events`: solo UUIDs y booleano. Sin PII.

Logs: Pino redacta `email`, `password`, `nit`, `phone`, `code`, tokens, claves.

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
| Redis | Upstash | **10.000 requests/día** |
| Archivos PDF/Audio | Cloudflare R2 | 10 GB · 1 M lecturas/mes (GuiasModule, aún no) |
| OTP SMS | Firebase Authentication | 10.000 SMS/mes |
| Email/password | Firebase Authentication | JURIDICA + ADMIN |
| Email transaccional | Resend | Aviso “cuenta verificada” (AG-17) |
| Push | Firebase FCM | Gratuito; módulo noticias no implementado |
| Anti-sleep | Cron-job.org → `GET /health` cada 10 min | — |
| Backups PG | GitHub Actions → R2 `backups/postgres/` | retención 7 días; Free no tiene PITR |

**Punto de migración:** al superar ~500 usuarios activos concurrentes → Render pago (sin spin-down) + Supabase Pro + Upstash Pro. El código NestJS no cambia.

---

## 6. Seguridad y cumplimiento

- **Ley 1581 (Habeas Data):** teléfono, NIT y email cifrados en reposo (pgcrypto AES-256). Lookup por HMAC. Nunca en logs ni en respuestas de `/admin/juridica/pending` (NIT enmascarado). Dumps de Postgres en R2 (`backups/`) son PII; bucket privado.
- **JWT:** RS256. TTL por rol (§ 4.3). Un refresh vivo por usuario; rotación con `GETDEL`; logout borra refresh e índice de sesión. Refresh de JURIDICA relee `verified`.
- **Privilegios:** no existe `POST /auth/register/admin`. Un API key compartido no identifica operador; el audit usa `sub` del JWT ADMIN.
- **Rate limiting:** Throttle por IP vía Redis (Upstash); OTP y registro JURIDICA tienen límites más estrictos en el controller.
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
