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

- **`hooks/session-start.sh`** — Al iniciar sesion: instala deps si faltan
  (`npm ci --ignore-scripts`), fija los env placeholders y recuerda los comandos
  de verificacion. Idempotente.

- **`skills/verify/SKILL.md`** — El "definition of done": `npm run lint` -> `npm
  test` -> `npm run build`, mostrando evidencia real. Claude lo activa solo al
  terminar un cambio, o se invoca con `/verify`.

## Config local (no versionada)

Preferencias o secretos personales van en `settings.local.json` (ignorado por
git). No commitees credenciales reales aqui.

## Como ampliar (roadmap)

Cuando haga falta mas control determinista, se pueden anadir:
- `hooks/pre-tool-use.sh` (PreToolUse): bloquear push a main, `rm -rf`, secretos.
- `hooks/post-edit-lint.sh` (PostToolUse): `eslint --fix` tras cada edicion.
- `agents/` : subagentes (security-reviewer, supabase-rls-reviewer, test-writer).
- `skills/` de dominio: `/new-migration`, `/new-edge-function`, `/rls-check`.
