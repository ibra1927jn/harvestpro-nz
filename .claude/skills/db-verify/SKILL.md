---
name: db-verify
description: Verifica cambios de base de datos / RLS ejecutandolos de verdad. Levanta un Postgres efimero, aplica el shim de Supabase + TODAS las migraciones, y corre tests de comportamiento RLS (rol atacante vs. permitido). Usar SIEMPRE al crear/cambiar migraciones o politicas RLS, antes de dar el cambio por bueno.
---

# db-verify — loop de verificacion para la base de datos

El `npm test` normal usa Supabase **mockeado**: nunca ejerce una politica RLS
real. Este mecanismo cierra ese hueco ejecutando las migraciones contra un
Postgres real y probando el comportamiento de las politicas.

## Como funciona
- `tests/rls/shim.sql` — recrea lo minimo de Supabase en un PG vanilla: roles
  (`authenticated`, `anon`, `service_role`), schema `auth` con
  `auth.uid()/role()/jwt()` dirigidos por GUC (para impersonar usuarios),
  schema `storage` minimo, `uuid_generate_v4()` mapeado a `gen_random_uuid()`,
  y los grants por defecto (para que `authenticated` tenga DML y la RLS sea la
  compuerta real).
- `tests/rls/boot.sh [--keep]` — levanta un cluster efimero como usuario
  `postgres` (Postgres nativo en `/usr/lib/postgresql/16/bin`; PG se niega a
  correr como root), carga el shim y aplica las 60 migraciones en orden,
  neutralizando `CREATE EXTENSION` (contrib no instalado). Reporta PASS/FAIL.
- `tests/rls/rls.test.sh` (= `npm run test:rls`) — siembra un huerto + usuarios
  (manager, runner) + ledger, impersona cada rol via
  `SET ROLE authenticated; SET request.jwt.claim.sub='<uuid>'`, y afirma el
  comportamiento SEGURO deseado.

## Como usar (loop TDD para RLS)
1. Corre `npm run test:rls`. Los tests afirman seguridad; si un bug existe,
   salen ROJO (reproducen la vulnerabilidad con datos reales).
2. Escribe la migracion de correccion (skill `/new-migration`) — recuerda:
   los "bloqueos" deben ser `AS RESTRICTIVE` (las permissive se combinan por OR
   y no bloquean; ver `/rls-check`).
3. Vuelve a correr `npm run test:rls`. VERDE = arreglo **demostrado**, no
   afirmado.
4. Al anadir una politica/tabla nueva, anade su assertion a `rls.test.sh`
   (rol que NO debe poder / rol que SI debe poder).

## Gotchas
- Requiere Postgres nativo + usuario `postgres` + `sudo` (disponibles en el
  entorno de sesion). No usa docker.
- El shim es una aproximacion: `auth.uid()` se fija por GUC, no por un JWT real.
  Fiel para RLS basada en rol/orchard (que es la del proyecto); no valida el
  flujo de emision de JWT ni Storage real.
- Impersonar: `SET ROLE authenticated` (matchea `TO authenticated`) +
  `SET request.jwt.claim.sub='<user_id>'` (los helpers `is_manager()`,
  `get_auth_orchard_id()`, `is_role()` resuelven rol/huerto desde
  `public.users WHERE id = auth.uid()`).
- Sembrar se hace como `postgres` (superuser, salta RLS); testear se hace
  siempre con `SET ROLE authenticated`.
