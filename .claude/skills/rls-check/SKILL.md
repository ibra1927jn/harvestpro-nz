---
name: rls-check
description: Audita la cobertura de Row Level Security de Supabase en harvestpro-nz — que cada tabla proteja sus filas por rol y que edge functions y RLS sean coherentes. Usar antes de commitear cambios de schema o cuando se pregunte por la seguridad de la DB.
---

Audita el estado de RLS del proyecto (read-only, no cambia nada). Delega el
analisis profundo al subagente `supabase-rls-reviewer` y sintetiza el resultado.

Que revisar:
1. **Inventario**: lista las tablas de las migraciones (`supabase/migrations/`) y
   marca cuales tienen `ENABLE ROW LEVEL SECURITY` y politicas.
2. **Huecos**: tablas sin RLS, politicas con `USING (true)` sospechoso, o roles
   con mas acceso del necesario. 8 roles: admin, manager, team_leader, runner,
   qc_inspector, hr_admin, payroll_admin, logistics.
3. **Coherencia**: cada edge function en `supabase/functions/` que toca la DB
   usa `requireRole([...])` — verifica que esos roles cuadren con las politicas
   RLS de las tablas afectadas. La edge function no puede ser la unica defensa.
4. **Casos especiales**: pickers archivados, dias cerrados (closed days),
   soft deletes — que no filtren datos donde no corresponde.

Entrega un reporte tabla-por-tabla: OK / hueco / riesgo, con archivo:linea y el
SQL sugerido para cada hueco. Prioriza datos sensibles (payroll, PII de
trabajadores, ledger de buckets). No modifiques migraciones existentes; si hay
que corregir algo, propon una migracion nueva (skill /new-migration).
