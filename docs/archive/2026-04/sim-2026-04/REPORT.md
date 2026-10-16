# REPORT.md — Simulación 14 días HarvestPro NZ
**Fecha:** 2026-04-15
**Objetivo:** Detectar bugs reales antes de pilot.

## 1. Pre-flight

### Tablas confirmadas (13/13)
allowed_registrations, block_rows, bucket_records, daily_attendance, day_closures,
harvest_seasons, harvest_settings, orchard_blocks, orchards, pickers, row_assignments,
users, wage_rates — TODAS presentes tras db reset.

## 2. Seed Summary (output de 99_sanity.sql)

| Tabla | Registros |
|---|---|
| orchards | 1 |
| harvest_seasons | 1 |
| orchard_blocks | 3 |
| block_rows | 60 |
| pickers | 34 |
| users (public) | 5 |
| daily_attendance | 352 |
| row_assignments | 40 |
| bucket_records | 34,778 |
| wage_rates | 1 |
| harvest_settings | 1 |

Scans por dia NZ: 01Apr=3360, 02Apr=3080, 03Apr=1445(lluvia), 04Apr=3584,
05Apr=1880(sat), 06Apr=0(dom), 07Apr=3204, 08Apr=4088(pico), 09Apr=2996,
10Apr=3084+224rejects, 11Apr=3276, 12Apr=1701, 13Apr=0(dom), 14Apr=3080

## 3. Schema Drift

Columnas referenciadas por frontend que NO existen en DB local:

| Columna | Tabla DB local | Columna real | Archivos fuente |
|---|---|---|---|
| check_in_time | daily_attendance | check_in | attendance.repository.ts:29,73,83,93,105,116,119; payroll.repository.ts:29,32; store-sync.repository.ts:24; TimesheetEditor.tsx:70,91,94 |
| check_out_time | daily_attendance | check_out | attendance.repository.ts:83,105,116; payroll.repository.ts:29,32; TimesheetEditor.tsx:71,91,97 |
| verified_by | daily_attendance | no existe | attendance.repository.ts:116,130; payroll.repository.ts:29; attendance.service.ts:31 |
| safety_harness_verified | daily_attendance | no existe | user.service.ts; zod.schemas.ts |
| effective_date | wage_rates | no existe | requerido por logica de negocio |

Status enum drift: database.types.ts declara 'sick'|'left_early'; DB local solo admite 'half_day'|'excused'.

## 4. Dirty Data Checklist

| # | Check | SQL | Resultado |
|---|---|---|---|
| 1 | 06 Apr: 0 registros | SELECT COUNT(*) FROM bucket_records WHERE (scanned_at AT TIME ZONE 'Pacific/Auckland')::DATE = '2026-04-06' | PASS: 0 |
| 2 | Emily Foster 09 Apr: asistencia sin scans | JOIN daily_attendance + bucket_records para P030 09 Apr | BUG: hours=9.93, scans=0 |
| 3 | Row B-R03 variety NULL | SELECT variety FROM block_rows WHERE row_number=23 | BUG: variety=NULL |
| 4 | Block C sin scans | LEFT JOIN block_rows->bucket_records WHERE block_id=C | PASS: 0 scans |
| 5 | Offline scans 13 Apr | SELECT WHERE scanned_at='2026-04-12T11:50:00Z' AND created_at>='2026-04-13' | BUG: 3 registros |
| 6 | Duplicados 12 Apr | GROUP BY picker_id,scanned_at HAVING COUNT>1 | BUG: 3 pares (P003,P007,P011) |
| 7 | James Wilson inactive | SELECT is_active FROM users WHERE email='james@...' | BUG: is_active=false |
| 8 | Tom Blackwood 07 Apr sin attendance | LEFT JOIN daily_attendance para P029 07 Apr | BUG: 12 scans, 0 attendance |

8/8 checks ejecutados: 6 bugs confirmados, 2 correctos.

## 5. Bugs Encontrados

### BUG-01 — BLOCKER: check_in_time/check_out_time no existen en schema local
DB tiene check_in/check_out. Frontend usa check_in_time/check_out_time en 10+ archivos.
Todo el flujo attendance->payroll devuelve NULL. TODAS las queries de asistencia retornan datos erroneos.
Archivos: attendance.repository.ts (lineas 29,73,83,93,105,116,119,130), payroll.repository.ts:29, store-sync.repository.ts:24

### BUG-02 — BLOCKER: check_in_picker() RPC falla con error SQL
CAST(NOW() AS TEXT(19)) no es sintaxis PostgreSQL valida. La funcion compila pero falla en runtime.
ERROR: "type modifier is not allowed for type text"
Archivos: supabase/migrations/20260201000001_func_check_in.sql:6, 20260201000002_func_check_out.sql:6

### BUG-03 — BLOCKER: verified_by no existe en daily_attendance
Requerida por attendance.repository.ts:116 en SELECT, linea 130 en UPDATE.
Payroll export y timesheet verification retornan null para todos los registros.

### BUG-04 — MAJOR: database.types.ts desfasado del schema local
Los tipos autogenerados describen una DB diferente. TypeScript acepta codigo roto en compilacion.
Status enum diverge: tipos='sick'|'left_early', DB local='half_day'|'excused'.
Archivo: src/types/database.types.ts (toda la seccion daily_attendance)

### BUG-05 — MAJOR: row_assignments.status='assigned' viola CHECK constraint
rowRepository.upsertRowAssignments() escribe status: 'assigned' as const (linea 35).
CHECK constraint solo admite 'active'|'completed'. INSERT falla con constraint violation.
Archivo: src/repositories/row.repository.ts:35

### BUG-06 — MAJOR: wage_rates sin effective_date — cambio mid-season no modelable
CHECK (hourly_rate >= 23.95) bloquea insertar tasa historica $23.50 (valida hasta 31 Mar).
Payroll semana 1 calculado a $23.95 en lugar de $23.50 -> ~$400 error semanal para 28 pickers.
Archivos: supabase/migrations/20260331_create_wage_rates.sql, 20260401_minimum_wage_2026.sql

### BUG-07 — MAJOR: Tom Blackwood tiene scans sin attendance record (07 Apr)
12 bucket_records para P029 sin daily_attendance. Payroll inpagable legalmente sin horas registradas.
Evidencia: CHECK8 scans_07apr=12, attendance_07apr=0 — BUG_CONFIRMED.

### BUG-08 — MAJOR: Emily Foster — attendance activa sin produccion (09 Apr)
hours_worked=9.93 en daily_attendance, cero bucket_records ese dia.
Sin validacion cruzada attendance-scans en day_close, pasa desapercibido.
Evidencia: CHECK2 BUG_CONFIRMED.

### BUG-09 — MAJOR: bucket_records sin unique constraint en (picker_id, scanned_at)
Migration 2026021105 solo agrega UNIQUE en id (ya PK). No protege contra duplicados exactos por timestamp.
Duplicados confirmados: 3 pares persistidos en 12 Apr.
Archivo: supabase/migrations/2026021105_idempotent_buckets.sql

### BUG-10 — MINOR: UTC vs NZ date mismatch en scans pre-turno
4 scans scanned_at='2026-04-09T16:30:00Z' = 04:30 NZ del 10 Apr.
Si el frontend agrupa por UTC date, aparecen el 09 Apr. Afecta KPIs de produccion diaria.
Evidencia: CHECK_bug_125_utc_day_mismatch BUG_CONFIRMED.

### BUG-11 — MINOR: Orphan completed row assignments (rows 5,6,7 Block A)
3 row_assignments con status='completed' sin deleted_at. Pickers pueden seguir escaneando en esas filas.
Evidencia: CHECK_orphan_completed_rows=3 BUG_CONFIRMED.

### BUG-12 — MINOR: James Wilson is_active=false sin filtro en store-sync
storeSyncRepository.getPickersQuery() no filtra por is_active=true.
Ex-empleado aparece en listas y metricas activas.
Archivo: src/repositories/store-sync.repository.ts:22-25

### BUG-13 — MINOR: block_rows.variety=NULL para row 23 — scans sin trazabilidad de variedad
84+ scans/dia sin variedad asignable. Reporte de produccion por variedad incompleto.
Evidencia: CHECK3 BUG_CONFIRMED.

## 6. Opinion Honesta

NO apta para pilot real.

Tres funcionalidades de negocio nucleo estan completamente rotas:
1. Check-in/check-out (BUG-01 + BUG-02): no existe ruta funcional para registrar asistencia
2. Payroll/compliance (BUG-03 + BUG-06): horas y tasas son incorrectas o NULL
3. Row assignments (BUG-05): Team Leader no puede asignar filas desde la app

Lo que SI funciona: insercion de bucket records, estructura orchard/season/blocks, RLS, modo mock (MSW), metricas derivadas de scans.

Tiempo minimo para pilot: 3-4 dias de trabajo focalizado.
Prioridad inmediata: renombrar columnas en schema (o actualizar repos), corregir RPC TEXT(19), fix row_assignments status, regenerar database.types.ts.
