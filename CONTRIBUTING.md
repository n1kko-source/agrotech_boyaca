# Guía de contribución — AgroTech Boyacá

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

Flujo recomendado: ramificar desde `main` → PR → merge a `main`.

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
# Backend
cd backend && npm run lint && npm run test:unit

# Mobile
cd mobile && flutter analyze && flutter test
```

- Backend: ESLint + Prettier (`backend/eslint.config.mjs`, `backend/.prettierrc`)
- Mobile: `analysis_options.yaml` con `flutter_lints`
- Editor: `.editorconfig` en la raíz del repo

## Alcance de PRs

Preferir PRs pequeños alineados a un ticket Jira (`AG-XX`). No mezclar refactors grandes con features salvo que el ticket lo pida.
