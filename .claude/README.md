# Claude Code harness — harvestpro-nz

Config compartida de Claude Code para el equipo. La idea es que cualquiera (o
cualquier sesion, incluida Claude Code en la web) herede el mismo entorno y las
mismas reglas. Basado en las best-practices de Anthropic y el concepto de
"harness" (las capas alrededor del modelo que lo hacen fiable).

## Las 5 capas del harness

| Capa | Donde | Estado |
|------|-------|--------|
| 1. Memory | `../CLAUDE.md`, `../SECURITY_RULES.md` | Reglas del proyecto |
| 2. Tools | MCP + CLI (`gh`, supabase, etc.) | Segun sesion |
| 3. Permissions | `settings.json` (`permissions.allow`/`deny`) | Allowlist + guardas |
| 4. Hooks | `hooks/session-start.sh` (`SessionStart`) | Bootstrap del entorno |
| 5. Observability | Skill `/verify` (verification loop) | Definition of done |

## Que hay aqui

- **`settings.json`** — Permisos y entorno compartidos:
  - `permissions.allow`: comandos seguros y frecuentes (lint, test, build, git)
    pre-aprobados para reducir prompts.
  - `permissions.deny`: refuerzo de `SECURITY_RULES.md` a nivel sistema — nunca
    leer/escribir `.env*`, nunca editar `supabase/migrations/**` (regla: no tocar
    migraciones existentes).
  - `env`: placeholders de Supabase + heap de Node que tests/build necesitan
    (mismos valores que `.github/workflows/ci.yml`).
  - `hooks`: registra el SessionStart hook.

- **`hooks/session-start.sh`** (SessionStart) — Al iniciar sesion: instala deps
  si faltan (`npm ci --ignore-scripts`), fija los env placeholders y recuerda los
  comandos de verificacion. Idempotente.

- **`hooks/pre-tool-use.sh`** (PreToolUse) — Guarda determinista que refuerza
  SECURITY_RULES.md: bloquea `git push` a main/master, `git push --force`,
  `rm -rf` sobre rutas peligrosas, escritura de `.env*`, y edicion de migraciones
  existentes. Bloquea con exit 2 y explica el motivo.

- **`hooks/post-edit-lint.sh`** (PostToolUse) — Corre `eslint --fix` sobre cada
  archivo `.ts/.tsx` editado dentro de `src/`. No bloquea el flujo.

- **`skills/verify/SKILL.md`** — El "definition of done": `npm run lint` -> `npm
  test` -> `npm run build`, mostrando evidencia real. Claude lo activa solo al
  terminar un cambio, o se invoca con `/verify`.

- **`skills/new-migration/`, `skills/new-edge-function/`, `skills/rls-check/`** —
  Workflows de dominio Supabase (naming, RLS obligatorio, patron de seguridad de
  edge functions, auditoria RLS **estatica**). Las dos primeras son manuales
  (`disable-model-invocation`); `/rls-check` puede activarse sola.

- **`skills/db-verify/`** — Loop de verificacion de base de datos: levanta un
  Postgres real, aplica shim + las 60 migraciones y corre tests de comportamiento
  RLS (`npm run test:rls`, ver `tests/rls/`). Cierra el hueco de que `npm test`
  mockea Supabase y nunca ejerce una politica RLS real. Usar al tocar migraciones.

- **`agents/`** — Subagentes especializados (contexto aislado, tools acotadas):
  - `security-reviewer` — vulnerabilidades, secretos, crypto, auth.
  - `supabase-rls-reviewer` — cobertura RLS por rol, coherencia con edge functions.
  - `test-writer` — tests Vitest siguiendo los patrones del repo.

## Config local (no versionada)

Preferencias o secretos personales van en `settings.local.json` (ignorado por
git). No commitees credenciales reales aqui.
