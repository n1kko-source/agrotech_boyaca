# AgroTech Boyacá

[![Backend CI](https://github.com/n1kko-source/agrotech_boyaca/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/n1kko-source/agrotech_boyaca/actions/workflows/backend-ci.yml)

Marketplace agrícola para Boyacá (Colombia): conecta productores rurales con compradores. Monorepo con API NestJS y app Flutter (Android primero, offline-first).

## Estructura

```
agrotech_boyaca/
├── backend/          # API NestJS (monolito modular) + Prisma (próximo)
├── mobile/           # App Flutter (Android / iOS plantilla)
├── docs/             # Contexto arquitectónico y paper
├── infra/            # Render, cron, backups R2, runbook
├── .editorconfig     # Estilo de editor compartido
└── CONTRIBUTING.md   # Ramas, commits y flujo de contribución
```

| Carpeta | Stack | Rol |
|---------|--------|-----|
| `backend/` | NestJS 11, TypeScript, Node 20+ | Auth, comunidad, commodities, sync, etc. |
| `mobile/` | Flutter 3.x, Dart | Cliente Android offline-first |
| `docs/` | Markdown | Decisiones de arquitectura |
| `infra/` | Config / notas | Despliegue y operación |

Detalle de módulos y decisiones: [`docs/BASE_INFRAESTRUCTURA.md`](docs/BASE_INFRAESTRUCTURA.md).

Host canónico del backend: **Render** (`https://agrotech-8p9b.onrender.com`). Aprovisionamiento (Render, Supabase, Upstash, R2, Firebase): [`infra/PROVISIONING.md`](infra/PROVISIONING.md).

## Prerrequisitos

- **Node.js** 20+ y npm
- **Flutter** 3.44+ (SDK en PATH; CI usa 3.44.8) y **Android Studio** (SDK Android)
- Opcional: Nest CLI (`npm i -g @nestjs/cli`)

## Backend

```bash
cd backend
npm ci
npm run lint:check
npm run build
npm run test:unit
npm run start:dev
```

API por defecto en `http://localhost:3000`. Health: `GET /health`.
Producción (Render Free): `https://agrotech-8p9b.onrender.com/health` — el servicio hiberna a los 15 min; cron cada 10 min (ver [`infra/cron-health.md`](infra/cron-health.md)).

Variables de entorno: copiar `backend/.env.example` → `backend/.env`. Deploy: [`infra/PROVISIONING.md`](infra/PROVISIONING.md) y [`render.yaml`](render.yaml).

CI (AG-14): en cada push/PR sobre `backend/**` corre lint, build, tests unitarios (más integration/e2e y smoke k6). El estado aparece en el PR. Al mergear a `main`, el workflow dispara el deploy en **Render**.

Backups (AG-40): dump diario de Supabase → R2 `backups/postgres/` (retención 7 días). Runbook: [`infra/RUNBOOK.md`](infra/RUNBOOK.md).

## Mobile

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
flutter run
```

## Convenciones

Ramas, Conventional Commits e ID de Jira: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
