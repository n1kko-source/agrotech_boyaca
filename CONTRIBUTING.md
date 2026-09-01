# Guía de contribución — AgroTech Boyacá

Antes de implementar o de contradecir un ticket, leer [`docs/BASE_INFRAESTRUCTURA.md`](docs/BASE_INFRAESTRUCTURA.md). Ese archivo es el contrato del repo. **El código actual manda.**

Módulos backend **ya en código**: Shared, Prisma, Auth, Admin, Comunidad (posts, perfiles, mensajería 1:1), Commodities, Notifications (FCM), Clima (alertas), Guías (PDF/audio). Noticias (contenido) y Sync están previstos: no inventarlos porque el ticket los nombre. Host de la API: solo Render.

## Ramas

Usar prefijo + ID de Jira + descripción corta en kebab-case:

| Prefijo | Uso |
|---------|-----|
| `feature/` | Nueva funcionalidad |
| `bugfix/` | Corrección de defectos |
| `hotfix/` | Parche urgente en producción |
| `chore/` | Tooling, deps, docs sin cambio de producto |

Ejemplos:

```
feature/AG-11-monorepo-foundations
bugfix/AG-23-otp-ttl
hotfix/AG-40-sync-crash
chore/AG-11-editorconfig
```

Flujo recomendado: ramificar desde `main` → PR → merge a `main`. Host de la API: **Render** (`https://agrotech-8p9b.onrender.com`).

El check **Lint, build & tests** del workflow `Backend CI` se reporta en el PR (éxito/fallo). Conviene marcarlo como required en GitHub → Settings → Branches → Protect `main`. No marcar **Deploy to Render** como required: en PRs ese job se omite a propósito.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) con el ID de Jira en el **scope**:

```
type(AG-XX): descripción en imperativo, en inglés o español consistente
```

### Tipos

| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `docs` | Solo documentación |
| `style` | Formato (sin cambio de lógica) |
| `refactor` | Refactor sin feat/fix |
| `test` | Tests |
| `chore` | Mantenimiento / tooling |
| `ci` | Pipelines CI |
| `build` | Build / dependencias de empaquetado |

### Ejemplos

```
feat(AG-11): add nest eslint and prettier
fix(AG-23): correct otp ttl in auth module
docs(AG-11): document branch and commit conventions
chore(AG-11): add editorconfig
```

Cuerpo opcional tras una línea en blanco. Un commit = un cambio lógico.

## Lint y formato

Antes de abrir PR:

```bash
# Backend (CI usa lint:check, sin --fix)
cd backend && npm run lint:check && npm run build && npm run test:unit

# Mobile
cd mobile && flutter analyze && flutter test
```

- Backend: ESLint + Prettier (`backend/eslint.config.mjs`, `backend/.prettierrc`)
- Mobile: `analysis_options.yaml` con `flutter_lints`
- Editor: `.editorconfig` en la raíz del repo

## Alcance de PRs

Preferir PRs pequeños alineados a un ticket Jira (`AG-XX`). No mezclar refactors grandes con features salvo que el ticket lo pida.
