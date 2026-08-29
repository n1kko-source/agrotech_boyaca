# AgroTech Boyacá — Contexto Arquitectónico v1
> Decisiones cerradas · Fase de diseño · Sin código ejecutado aún
 
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
 
## 2. Usuarios objetivo
 
| Rol | Descripción | Autenticación |
|---|---|---|
| NATURAL | Campesino individual, productor | OTP SMS → JWT |
| JURIDICA | Asociación, cooperativa, empresa compradora | OTP SMS → JWT |
 
> Empresa **no es un rol independiente**. Es `entity_type: 'empresa'` dentro del perfil JURIDICA.
 
**Perfil técnico del usuario:**
- Dispositivo: Android gama baja/media
- Conectividad: 2G/3G intermitente (Boyacá rural)
- 81.6% con smartphone · 90.4% uso activo diario
- Herramienta principal actual: WhatsApp y llamadas
 
---
 
## 3. Plataforma cliente
 
**Decisión: Flutter (Android primero)**
 
- Desarrollo directo como app nativa Android con Flutter
- Offline-first con SQLite local (`sqflite`)
- Sincronización con backend al recuperar señal vía `/sync`
- Push notifications nativas vía FCM
- **Fase 2:** mismo codebase Flutter compila para iOS sin reescritura
- PWA descartada: Service Workers poco confiables en 2G/3G rural
 
---
 
## 4. Backend
 
**Framework:** NestJS (TypeScript) — Monolito modular (no microservicios en v1)
 
**Justificación monolito:** evita latencia inter-servicio bajo 2G/3G, reduce complejidad operativa en fase MVP, extractable a microservicios cuando la carga lo justifique.
 
### Módulos
 
| Módulo | Responsabilidad |
|---|---|
| AuthModule | OTP · JWT RS256 · Guards · Roles · Ley 1581 |
| ComunidadModule | Matching productor/comprador · Posts · Mensajería · FTS PostgreSQL |
| CommoditiesModule | Precios en tiempo real · Redis TTL agresivo |
| NoticiasModule | FCM push · WebSocket Gateway · Alertas · Clima |
| GuiasModule | PDF/Audio metadata · Entrega low-bandwidth |
| SyncModule | Endpoint /sync · Batch offline · Conflict resolution LWW |
 
### Shared Kernel
DTOs · Guards · Interceptors · Pipes · Throttle (Redis) · Logger · GlobalExceptionFilter
 
### Principios API
- Payloads mínimos (claves cortas en endpoints frecuentes)
- Paginación cursor-based obligatoria
- Gzip/Brotli en todas las respuestas
- Target latencia: < 200ms
 
---
 
## 5. Infraestructura — Free Tier (Fase MVP)
 
| Capa | Servicio | Límite a monitorear |
|---|---|---|
| Backend NestJS | Render | 750h/mes · sleep 15min → cron ping 10min |
| PostgreSQL | Supabase | 500 MB almacenamiento |
| Redis | Upstash | **10.000 requests/día ⚠** |
| Archivos PDF/Audio | Cloudflare R2 | 10 GB · 1M lecturas/mes |
| OTP SMS | Firebase Authentication | 10.000 SMS/mes |
| Push notifications | Firebase FCM | Gratuito permanente |
| Anti-sleep | Cron-job.org → GET /health cada 10min | — |
 
**Punto de migración:** al superar ~500 usuarios activos concurrentes → Render pago (sin spin-down) + Supabase Pro + Upstash Pro. El código NestJS no cambia.
 
---
 
## 6. Seguridad y cumplimiento
 
- **Ley 1581 (Habeas Data):** datos sensibles (teléfono, NIT, email) cifrados en reposo con pgcrypto AES-256. Nunca en logs.
- **JWT:** firmados RS256 (clave asimétrica). Access token 15min (NATURAL) / 60min (JURIDICA). Refresh token hasheado en Redis.
- **Rate limiting:** Throttle por IP/usuario vía Redis (Upstash).
- **OWASP:** Helmet, ValidationPipe global, sanitización de inputs.
 
---
 
## 7. Estrategia offline-first
 
```
Usuario sin señal → Opera con SQLite local
                  → Cola de operaciones con timestamp local
Al recuperar señal → POST /sync con batch de operaciones
                   → Backend aplica Last-Write-Wins (ventana 5min)
                   → Responde con delta de cambios del servidor
```
 
Ningún endpoint crítico (precios, ofertas, contactos) requiere conexión en tiempo real.
 
 
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
 
### Comunicación entre usuarios
- Mensajería directa interna → ComunidadModule
- Canal: productor ↔ comprador negocian precio, cantidad y logística
- Pago: fuera de la plataforma vía Nequi / Daviplata / transferencia
 
### Por qué no Modelo B (comisión por transacción) en MVP
- Requiere registro ante Superintendencia Financiera de Colombia
- Cumplimiento SARLAFT (prevención lavado de activos)
- Integración PSE / Wompi / PayU con obligaciones tributarias complejas
- Inviable en fase de validación
 
### Punto de migración a Modelo B
Cuando se documenten más de 500 transacciones/mes fuera de la plataforma
→ integrar Wompi (Bancolombia) como procesador
→ activar comisión por transacción
→ El ComunidadModule ya tiene el historial de negociaciones como evidencia