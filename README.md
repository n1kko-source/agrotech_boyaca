# AgroTech Boyacá

Marketplace agrícola para Boyacá (Colombia): conecta productores rurales con compradores. Monorepo con API NestJS y app Flutter (Android primero, offline-first).

## Estructura

```
agrotech_boyaca/
├── backend/          # API NestJS (monolito modular) + Prisma (próximo)
├── mobile/           # App Flutter (Android / iOS plantilla)
├── docs/             # Contexto arquitectónico y paper
├── infra/            # Notas Railway / cron / migraciones
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

Aprovisionamiento free-tier (Railway, Supabase, Upstash, R2, Firebase): [`infra/PROVISIONING.md`](infra/PROVISIONING.md).

## Prerrequisitos

- **Node.js** 20+ y npm
- **Flutter** 3.44+ (SDK en PATH; CI usa 3.44.8) y **Android Studio** (SDK Android)
- Opcional: Nest CLI (`npm i -g @nestjs/cli`)

## Backend

```bash
cd backend
npm ci
npm run lint
npm run test:unit
npm run start:dev
```

API por defecto en `http://localhost:3000`. Health: `GET /health`.

Variables de entorno: copiar `backend/.env.example` → `backend/.env`.

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
