---
name: new-migration
description: Crea una nueva migracion de Supabase para harvestpro-nz siguiendo las convenciones del repo (naming por timestamp, RLS obligatorio, nunca modificar migraciones existentes). Invocar con /new-migration <descripcion>.
disable-model-invocation: true
---

Crea una migracion NUEVA en `supabase/migrations/`. Regla de oro del proyecto:
**nunca modificar migraciones existentes** — todo cambio de schema va en un
archivo nuevo (el PreToolUse hook bloquea editar migraciones ya presentes).

Descripcion pedida: $ARGUMENTS

Pasos:
1. **Naming**: `YYYYMMDDHHMMSS_<snake_case_desc>.sql` (timestamp completo UTC,
   estandar Supabase CLI). Calcula el timestamp actual con `date -u +%Y%m%d%H%M%S`.
   Debe ordenar DESPUES de la ultima migracion existente (`ls supabase/migrations/`).
2. **Contenido**: SQL idempotente donde sea razonable (`IF NOT EXISTS`,
   `CREATE OR REPLACE`). Comentario de cabecera en espanol explicando el cambio.
3. **RLS obligatorio**: si creas una tabla, incluye en la MISMA migracion:
   - `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;`
   - Politicas explicitas por operacion y por rol (8 roles: admin, manager,
     team_leader, runner, qc_inspector, hr_admin, payroll_admin, logistics).
   - Mira migraciones RLS existentes como patron (`2026021103_complete_rls.sql`,
     `2026021106_rls_block_archived_pickers.sql`).
4. **Patrones del repo**: optimistic locking (columna de version), soft deletes
   (`archived_at`/`deleted_at`), `timestamptz` para auditoria.
5. **Grants**: si creas funciones RPC, anade los `GRANT` correspondientes (ver
   migraciones `*_grant_*.sql` como ejemplo).

Al terminar:
- Revisa la migracion con el subagente `supabase-rls-reviewer`.
- NO la apliques a produccion (SECURITY_RULES.md: deploy a prod requiere
  aprobacion de Ibrahim). Solo crea el archivo y explica que hace.
