# Estado del Proyecto — harvestpro-nz
**Fecha:** 2026-04-15 | **Versión:** 9.9.0 | **Alcance:** Inventario completo sin azúcar

> Sin azúcar. Si una superficie es placeholder, lo dice. Si el estado es desconocido, lo dice.

---

## 1. MANAGER — VISTA POR VISTA

### DashboardView.tsx
**Fuente de datos:** `useHarvestMetrics()` → Zustand `bucketRecords` (store del día actual)

| Superficie | Estado | Fuente real |
|---|---|---|
| KPI cards (producción, velocidad, labour, active crew) | ✅ Conectado | Zustand store (scans del día NZ) |
| VelocityChart (bins/hora, ventana de turno) | ✅ Conectado | Zustand store |
| GoalProgress (barra animada hacia meta) | ✅ Conectado | useHarvestMetrics.projectedEndOfDay |
| PerformanceFocus (Top 3 pickers, below average) | ✅ Conectado | Zustand store |
| WageShieldPanel summary | ✅ Conectado | analyticsService.calculateWageStatus() |
| ETA fin de turno | ✅ Conectado | settings.shift_end_time (parametrizado) |
| **Delta ayer vs hoy** | ❌ ROTO | yesterdayStr usa UTC, store no tiene ayer → siempre 0 |
| TeamLeaders sidebar | ✅ Conectado | Zustand crew slice |

**Bug activo:** `yesterdayStr = new Date(...).toISOString().split('T')[0]` — UTC, no NZ. Store solo carga desde medianoche NZ hoy → `yesterdayCount` siempre 0. Fix pendiente en Paso 5.

---

### WeeklyReportView.tsx
**Fuente de datos:** `useWeeklyReport()` → Zustand store + `analyticsService.getDailyTrends()`

| Superficie | Estado | Fuente real |
|---|---|---|
| KPI cards (Total Bins, Total Hours, Labour, Cost/Bin) | ❌ ROTO | `weeklySeries({ from: today, to: today })` — rango de 1 día, no semana |
| binsTrend (TrendLineChart) | ❌ DEMO HARDCODEADO | getDailyTrends → day_closures vacía → fallback bins=[320,350,290,310,280,340,360] |
| workforceTrend (TrendLineChart) | ❌ DEMO HARDCODEADO | mismo path |
| Team Rankings | ⚠️ PARCIAL | Zustand store, pero datos limitados al día actual |
| Top 10 Pickers table | ⚠️ PARCIAL | Zustand store, mismo problema de rango |
| TeamDrawer (click en equipo) | ⚠️ STUB accesible | UI básica (backdrop + panel). Sin roster ni stats de miembros |
| Export PDF/CSV | ✅ Conectado | Datos del hook (correctos para el día actual) |

**Bugs activos (Pasos 2 y 4):**
- Charts: `getDailyTrends` cae a demo hardcodeado porque `day_closures` está vacía (Fix: Paso 2 — `getDailyTrendsV2`)
- KPI cards: rango = un solo día en UTC (Fix: Paso 4 — `startOfWeekNZ()` + fetch Supabase directo)

---

### CostAnalyticsView.tsx
**Fuente de datos:** `useCostAnalytics()` → Zustand store + analytics-trends.service

| Superficie | Estado | Fuente real |
|---|---|---|
| KPI summary (cost/bin, total bins, labour, top-up) | ⚠️ PARCIAL | Zustand store, solo datos del día |
| Donut chart (piece-rate vs top-up) | ⚠️ PARCIAL | Zustand store |
| Daily Cost Trend (TrendLineChart 7 días) | ❌ DEMO HARDCODEADO | getDailyTrends → day_closures vacía → fallback hardcodeado |
| Break-even line | ✅ Calculado | settings.min_wage_rate / settings.piece_rate |
| Picker table | ⚠️ PARCIAL | Zustand store, solo hoy |

**Bug activo:** `ca.costTrend` viene de `analyticsService.getDailyTrends()` que cae a demo data. Fix: Paso 2.

---

### WageShieldPanel.tsx
**Fuente de datos:** `analyticsService.calculateWageStatus()` + `getDailyBleed()`

| Superficie | Estado | Fuente real |
|---|---|---|
| Total bleed KPI | ✅ Conectado | Calculo real sobre crew + settings |
| Team bleed breakdown | ✅ Conectado | Agrupado por team_leader_id |
| Critical pickers list | ✅ Conectado | Filtrado sobre status=below_minimum |
| **7-Day Bleed Trend (TrendLineChart)** | ❌ MOCK PURO | `getDailyBleed()` → siempre `Math.random()` — nunca fue real |

**Bug activo (Paso 3):** `getDailyBleed` no fue nunca real. Compliance NZ — no puede ir a producción con Math.random().

---

### HeatMapView.tsx
**Fuente de datos:** Zustand store → `bucketRecords`, `orchardBlocks`

| Superficie | Estado | Fuente real |
|---|---|---|
| Grid de densidad por fila | ✅ Conectado | Calculado desde bucketRecords en store |
| Color por % completado | ✅ Conectado | total_buckets / target_buckets por row |
| Tooltips (density score, pickers únicos) | ✅ Conectado | Agregado en store |
| Filtro de rango de fechas | ✅ Conectado | UI state → re-calcula sobre store |
| Block selector | ✅ Conectado | Zustand orchardBlocks |

**Estado:** Completamente conectado. La limitación es que el store solo tiene datos del día actual, por lo que "last7days" / "last30days" mostrarán datos incompletos. Bug preexistente (BUG de Parte C), no en scope inmediato.

---

### OrchardMapView.tsx
**Fuente de datos:** `useOrchardMap()` → `row_assignments`, `orchard_blocks`, `block_rows`, `bucket_records`

| Superficie | Estado | Fuente real |
|---|---|---|
| HUD (blocks, rows, active pickers, completion %) | ✅ Conectado | Supabase directo via useOrchardMap |
| Row grid (bins, bpa, picker asignado) | ✅ Conectado | row_assignments + bucket aggregation |
| Filtro por variedad | ✅ Conectado | UI state |
| Progreso por fila | ✅ Conectado | row_assignments.status + bucket count |
| Picker status dot | ✅ Conectado | Tiempo desde último scan |

**Nota:** `row_assignments.status` fue corregido de 'active' → 'assigned' en código. La migración `20260414_fix_settings_and_row_assignments.sql` está **PENDIENTE DE APLICAR** — sin ella la feature sigue rota en producción.

---

### AnomalyDetectionView.tsx
**Fuente de datos:** `fraudDetectionService.fetchAnomalies()` → Edge Function `detect-anomalies`

| Superficie | Estado | Fuente real |
|---|---|---|
| Lista de anomalías | ✅ Conectado | Edge Function (3 tipos: velocity, peer, grace) |
| Filter tabs (All/Velocity/Peer/Grace) | ✅ Conectado | Client-side filter post-fetch |
| Severity badges | ✅ Conectado | Edge Function response |
| Dismissal (suprimir falsos positivos) | ✅ Conectado | Cache local en fraudDetectionService |
| Live badge counter | ✅ Conectado | anomalies.length en store |

**UNKNOWN:** Estado real del Edge Function `detect-anomalies` en Supabase local vs producción. No verificado si está deployed en la instancia de producción.

---

### SettingsView.tsx
**Fuente de datos:** `useSettings()` → `harvest_settings` table

| Superficie | Estado | Fuente real |
|---|---|---|
| Piece rate / min wage | ✅ Conectado | harvest_settings (upsert en save) |
| Target bins/hour (con floor de compliance) | ✅ Conectado | Calculado: ceil(min_wage/piece_rate) |
| Shift hours (start/end) | ✅ Conectado | harvest_settings.shift_start_time / shift_end_time |
| MFA device trust TTL | ✅ Conectado | harvest_settings.mfa_device_trust_ttl_hours |
| Day Closure button | ✅ Conectado | Crea registro en day_closures |
| Language switcher | ✅ UI only | setLocale() — no persiste en DB |

**Nota:** Las columnas `variety`, `shift_start_time`, `shift_end_time`, `mfa_device_trust_ttl_hours` fueron añadidas en la migración `20260414`. Si no está aplicada, el save de settings falla con error 42703.

---

### TimesheetEditor.tsx
**Fuente de datos:** `attendanceService.getAttendanceByDate()` + `payrollService.generateDailyTimesheet()`

| Superficie | Estado | Fuente real |
|---|---|---|
| Tabla de asistencia diaria | ✅ Conectado | daily_attendance table |
| Edición inline (check-in/out) | ✅ Conectado | manage-attendance Edge Function con audit trail |
| Datos de producción (bins, rejected, grades) | ✅ Conectado | bucket_records para la fecha |
| Earnings breakdown | ✅ Conectado | Cálculo fresh via payrollService |

---

### Vistas menores (todas conectadas)
- **GoalProgress:** useHarvestMetrics, real ✅
- **PredictionsCard:** predictions.service sobre store, real ✅
- **TeamsView:** crew slice de Zustand, real ✅
- **LogisticsView:** useLogisticsHealth() sobre transport_requests + bins, real ✅
- **VelocityChart:** bucketRecords del store, real ✅

---

## 2. SCHEMA DE SUPABASE

### Tablas existentes (26 confirmadas en migrations)

| Tabla | Migración | Usada en código | Estado de datos | Notas |
|---|---|---|---|---|
| `orchards` | schema_v3 | ✅ Extensivo | Activa | Raíz de tenancy |
| `harvest_seasons` | schema_v3 | ✅ | Activa | FK orchard_id |
| `orchard_blocks` | schema_v3 | ✅ | Activa | FK orchard_id |
| `block_rows` | schema_v3 | ✅ | Activa | target_buckets añadido 2026-04-13 |
| `users` | schema_v3 | ✅ | Activa | Supabase auth.users linked |
| `pickers` | schema_v3 | ✅ Extensivo | Activa (26 en sim) | FK user_id, team_leader_id |
| `bucket_records` | schema_v3 | ✅ Extensivo | **18.222 scans en sim** | Tabla core de producción |
| `daily_attendance` | schema_v3 | ✅ | Activa (~180 filas) | 25 filas huérfanas Feb-27 (fix pendiente) |
| `row_assignments` | schema_v3 + 20260414 | ✅ | Activa | **CRÍTICO:** migración 20260414 pendiente de aplicar |
| `harvest_settings` | schema_v3 + 20260414 | ✅ | Activa (1 por orchard) | **CRÍTICO:** columnas nuevas en migración pendiente |
| `quality_inspections` | schema_v3 | ✅ | Activa (~490 filas) | RLS corregido 2026-03-28 |
| `qc_inspections` | schema_v3 | ⚠️ Parcial | Desconocido | Posible duplicado de quality_inspections |
| `day_closures` | 20260210 | ✅ Referenciada | **VACÍA** | Solo via DayClosureButton, nunca en sim |
| `day_setups` | schema_v3 | ⚠️ Mínimo | Desconocido | Weather/notes, no prominente en UI |
| `bins` | schema_v3 | ✅ | Activa | FK transport_request_id |
| `fleet_vehicles` | schema_v3 | ✅ | Activa | FK orchard_id |
| `transport_requests` | schema_v3 | ✅ | Activa | status enum (pending/in_transit/delivered) |
| `contracts` | schema_v3 | ⚠️ Mínimo | Desconocido | HHRR, no prominente |
| `conversations` | schema_v3 | ✅ | Activa | FK orchard_id |
| `chat_messages` | schema_v3 | ✅ | Activa | FK conversation_id, picker_id |
| `messages` | 20260403 | ✅ | Activa | Broadcasts del sistema |
| `broadcasts` | 20260403 | ✅ | Activa | Broadcast messaging |
| `audit_logs` | 2026021101 | ✅ | Activa | Compliance trail |
| `login_attempts` | 2026021102 | ✅ | Activa | Brute-force tracking |
| `account_locks` | 2026021102 | ✅ | Activa | Lockout state |
| `sync_conflicts` | schema_v3 | ✅ | Activa (mínima) | Offline sync |
| `allowed_registrations` | schema_v3 | ✅ | Activa | Email whitelist |

### Tablas usadas por código pero vacías en sim
- `day_closures` — Vacía. Solo se rellena si el manager pulsa DayClosureButton. Causa raíz del fallback a demo data en analytics.
- `day_setups` — Estado desconocido. No parece usarse en vistas principales.
- `contracts` — Estado desconocido en sim.

### Tablas que el código espera pero tienen columnas pendientes (migración 20260414)
- `row_assignments` — falta columna `orchard_id` (FK) e índice
- `harvest_settings` — faltan columnas: `variety`, `shift_start_time`, `shift_end_time`, `mfa_device_trust_ttl_hours`

**Sin migración aplicada:** row assignments no persisten correctamente, settings save falla.

### Tablas mencionadas en comentarios históricos pero no encontradas
- `bucket_events` — referenciada en comentarios de calculate-payroll (fue renombrada a `bucket_records` en v3). Código actualizado.

---

## 3. APPS DE OTROS ROLES

### TeamLeader (`src/pages/TeamLeader.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| HomeView | ✅ | Zustand store (crew, buckets del día) |
| TeamView (roster, check-in del equipo) | ✅ | daily_attendance + pickers |
| TasksView (row assignments) | ⚠️ Afectado | row_assignments — migración 20260414 pendiente |
| AttendanceView (check-in/out manual) | ✅ | manage-attendance Edge Function |
| TimesheetEditor (reuso del manager) | ✅ | Supabase directo |
| HistoryTab (historial de earnings) | ✅ | Supabase directo via picker-history.service |
| MessagingView | ✅ | conversations + chat_messages |

**Hardcoded:** Header title no usa i18n. Menor.

---

### Runner (`src/pages/Runner.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| LogisticsView (pickups, dropoffs) | ✅ | transport_requests + bins |
| RunnersView (leaderboard) | ✅ | useLogisticsHealth |
| WarehouseView (inventario de bins) | ✅ | bins table |
| ScannerModal (escaneo de cubetas) | ✅ | record-bucket Edge Function |
| QualityRatingModal | ✅ | quality_inspections |
| MessagingView | ✅ | conversations + chat_messages |
| ETA de pickup | ⚠️ HARDCODED | "45 mins desde Depot A" — sin ruta real |

---

### QC Inspector (`src/pages/QualityControl.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| InspectTab (gradar cubetas) | ✅ | quality_inspections |
| StatsTab (stats diarias/semanales) | ✅ | quality_inspections |
| TrendsTab (tendencias de calidad) | ✅ | quality_inspections |
| HistoryTab (historial por picker) | ✅ | quality_inspections |

**Estado:** Completamente conectado. Una de las vistas más limpias del proyecto.

---

### HHRR (`src/pages/HHRR.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| AdminUsersTab (gestión de usuarios/roles) | ✅ | users + pickers |
| AdminOrchardsTab (orchards, seasons, settings) | ✅ | orchards + harvest_seasons |
| AdminComplianceTab (violaciones, alertas) | ✅ | compliance.service + audit_logs |
| **DocumentsTab** | ❌ STUB | UI existe, sin upload a storage. Sin S3/Supabase Storage integration |
| **CalendarTab (licencias)** | ❌ HARDCODED | Datos de calendario fijos, sin conexión a DB |

---

### Logistics Dept (`src/pages/LogisticsDept.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| FleetTab (vehículos) | ✅ | fleet_vehicles |
| RequestsTab (solicitudes) | ✅ | transport_requests |
| BinsTab (inventario) | ✅ | bins |
| HistoryTab | ✅ | transport_requests (histórico) |
| **RoutesTab** | ❌ STUB | Infraestructura de UI, sin optimización de rutas implementada |

---

### Payroll Admin (`src/pages/Payroll.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| Daily/Weekly summary | ✅ | bucket_records + harvest_settings |
| Picker earnings detail | ✅ | calculate-payroll Edge Function |
| PAYE/KiwiSaver/ACC deductions | ✅ | nz-payroll-deductions.service |
| Export CSV/PDF | ✅ | exportService (MPI format incluido) |
| **Holiday rates 1.5x** | ❌ NO IMPLEMENTADO | Holidays Act NZ — no está en payroll |

---

### Admin (`src/pages/Admin.tsx`)
**Página existe:** ✅

| Vista / Tab | Estado | Supabase real? |
|---|---|---|
| AdminUsersTab | ✅ | users (manage-admin Edge Function) |
| AdminOrchardsTab | ✅ | orchards + seasons |
| AdminComplianceTab | ✅ | audit_logs |
| AuditLogViewer | ✅ | audit_logs |

---

## 4. INFRAESTRUCTURA Y OPS

### Edge Functions (11 total)

| Función | Propósito | Estado local | Estado producción |
|---|---|---|---|
| `api-v1` | Gateway REST (payroll, analytics, reports) | ✅ | UNKNOWN |
| `approve-timesheet` | Firma de timesheets | ✅ | UNKNOWN |
| `calculate-payroll` | Cálculo nómina diaria | ✅ | UNKNOWN |
| `check-compliance` | Verificación salario mínimo NZ | ✅ | UNKNOWN |
| `detect-anomalies` | Detección de fraude (3 reglas) | ✅ | UNKNOWN |
| `manage-admin` | Gestión de roles | ✅ | UNKNOWN |
| `manage-attendance` | Check-in/out con audit trail | ✅ | UNKNOWN |
| `provision-orchard` | Onboarding nuevo orchard | ✅ | UNKNOWN |
| `record-bucket` | Grabación de scans | ✅ | UNKNOWN |
| `send-push` | Web Push (RFC 8291) | ✅ | UNKNOWN |
| `submit-audit-log` | Audit trail manual | ✅ | UNKNOWN |

**UNKNOWN** = no hay confirmación de que estas funciones estén deployadas en la instancia de producción de Supabase. Solo verificadas en local.

### Migraciones

**Activas aplicadas:** 17 migraciones desde 20260101000000_schema_v3

**PENDIENTE DE APLICAR MANUALMENTE:**
- `20260414_fix_settings_and_row_assignments.sql` — Crítica. Sin ella: row assignments rotos, settings save falla.

**Para aplicar:**
```bash
supabase db push   # o copiar SQL al Supabase SQL editor en producción
supabase gen types typescript --local > src/types/database.types.ts  # tras aplicar
```

### Seeds

| Seed | Propósito | Para |
|---|---|---|
| `seed_test_accounts.sql` | 8 usuarios de prueba | Desarrollo local |
| `seed_2weeks_local.sql` | Sim 14 días (18.222 scans) | **Sim local únicamente** |
| `seed_today_harvest_data.sql` | Datos del día actual | Desarrollo local |
| `seed_season_simulation.sql` | Setup de temporada | Desarrollo local |
| `seed_jp_cherries_blocks.sql` | Bloques/filas para JP Cherries | Desarrollo local |
| `seed_blocks_and_rows.sql` | Estructura genérica | Desarrollo local |
| `seed_production_admin.sql` | Admin de producción | **Producción** |

**Ningún seed de producción carga datos de pickers, scans o attendance reales.** Producción arranca con datos vacíos excepto el admin.

### RLS

- Activo en todas las tablas (26/26).
- `get_user_orchard_ids()` función base para aislamiento por tenant.
- quality_inspections: políticas añadidas 2026-03-28 (era table con RLS activo y 0 políticas → bug bloqueante corregido).

### Rate limiter

Edge Functions usan rate limiter in-memory (en `_shared/security.ts`). **Ephemeral — se resetea en cada cold start.** Aceptable para MVP, inaceptable para producción bajo carga. Solución: Upstash Redis o tabla PostgreSQL.

### Runbooks

`docs/RUNBOOK.md` existe. Contenido no verificado en esta auditoría.

---

## 5. TESTS

### Configuración

```
vitest.config.ts:
  environment: jsdom
  pool: threads, maxForks: 2
  timeout: 30s
  coverage: v8 (HTML + LCOV)
  thresholds: lines/statements/functions 70%, branches 60%

vitest.config.integration.ts:
  environment: node   ← necesario para fetch real a localhost
  setupFiles: []      ← sin mocks, sin fake-indexeddb
  include: tests/integration/**/*.test.ts
```

### Estado actual

```
Unit + integration (jsdom): ~4,990 tests, 407 archivos → 100% green (2026-04-14)
Integration real Supabase:  7 tests, 1 archivo → 100% green (2026-04-15, Paso 1)
E2E Playwright:             ~278 tests, 29 specs → 225/278 pass (53 fallos por rate limiting de auth)
```

### Cobertura por dominio

| Dominio | Archivos test | Estado |
|---|---|---|
| Services (analytics, payroll, compliance, sync...) | 50+ | ✅ Green |
| Hooks (useHarvestMetrics, useWeeklyReport, etc.) | 30+ | ✅ Green |
| Repos (bucket-records, picker, payroll...) | 15+ | ✅ Green |
| Stores (Zustand slices) | 10+ | ✅ Green |
| Auth / Context | 5+ | ✅ Green |
| Manager Views | 15+ | ✅ Green |
| UI Components | 20+ | ✅ Green |
| i18n | 8+ | ✅ Green (english-smell.test.ts: 181 tests) |
| Utils / Crypto | 20+ | ✅ Green |
| **Integration Supabase real** | 1 | ✅ Green (analytics.supabase.test.ts, Paso 1) |

### Ratio

- Unit: ~70%
- Integration (con mocks): ~25%
- Integration (Supabase real): <1% (solo analytics, Paso 1)
- E2E: ~5%

### Tests que corren contra Supabase local real

Solo `tests/integration/analytics.supabase.test.ts`. El resto usa fake-indexeddb, MSW, o mocks de Supabase client.

---

## 6. DEUDA TÉCNICA CONOCIDA

### TODOs en código (identificados con grep)

```
src/i18n/locales/to/index.ts     — TODO translate: settings.*, teams.*, insights.*, panel.*
src/i18n/locales/tl/index.ts     — TODO translate: settings.*, teams.*, insights.*, panel.*
src/i18n/locales/sm/index.ts     — TODO translate: settings.*, teams.*, insights.*, panel.*
src/i18n/locales/mi/index.ts     — TODO translate: settings.*, teams.*, insights.*, panel.*
src/i18n/locales/hi/index.ts     — TODO translate: settings.*, teams.*, insights.*, panel.*
src/services/logisticsMetrics/health.ts — TODO ajustar AMBER_RATIO con datos reales de turno
src/services/logisticsMetrics/health.ts — TODO ajustar RED_RATIO con datos reales de turno
```

### Mocks residuales en producción (no en tests)

| Archivo | Mock | Impacto |
|---|---|---|
| `analytics-trends.service.ts` L130-166 | `bins = [320,350,290,310,280,340,360]` hardcodeado | WeeklyReport + CostAnalytics muestran datos inventados |
| `analytics-trends.service.ts` getDailyBleed | `Math.random()` — 100% falso | WageShieldPanel trend nunca fue real |

Estos son los únicos mocks residuales en código de producción detectados. El resto de `src/` usa datos reales o los deriva del store.

### Flags feature activos

No hay `USE_*` flags activos en el código actualmente. El flag `USE_LIVE_AGGREGATES` será introducido en Paso 2 como estrategia de coexistencia temporal.

### Imports de mocks en producción

NINGUNO detectado. `src/mocks/` solo es importado desde archivos de test (`*.test.ts`, `*.test.tsx`, setup files). Producción limpia.

### Código zombi sospechado

- `nz-payroll-deductions.service.ts` vs `nz-tax-rates.ts` — posible superposición. No verificado en profundidad.
- `qc_inspections` vs `quality_inspections` — dos tablas con propósito solapado. Naming inconsistente.
- `NZ_MINIMUM_WAGE_2024` en `nz-law.ts` — marcado `@deprecated` pero no eliminado (tests históricos lo usan).

---

## 7. PENDIENTES EXPLÍCITOS

### Bloqueantes inmediatos

| Tarea | Impacto si no se hace |
|---|---|
| Aplicar `20260414_fix_settings_and_row_assignments.sql` | row_assignments roto, settings save falla |
| Regenerar `database.types.ts` tras migración | Tipos desincronizados |

### Pasos del plan data-plumbing (en curso)

| Paso | Descripción | Estado |
|---|---|---|
| Paso 1 | `getDailyAggregates` + integration test | ✅ COMPLETO (7/7 tests, 18.222 scans) |
| Paso 2 | `getDailyTrendsV2` + `USE_LIVE_AGGREGATES` flag | ⏸ Pendiente luz verde |
| Paso 3 | `getDailyBleed` real (daily_attendance + wage_rates) | ⏸ Pendiente |
| Paso 4 | `useWeeklyReport` — rango semanal + fetch Supabase directo | ⏸ Pendiente |
| Paso 5 | DashboardView delta ayer (UTC→NZ + fetch Supabase) | ⏸ Pendiente |
| Paso 6 | Eliminar demo data + `getDailyTrends` viejo | ⏸ Solo tras verificar Pasos 2-5 en browser |

### Minors explícitamente aplazados a v17 (BUG-10 a BUG-14)

Detalle exacto no verificado en esta auditoría — referenciados en `docs/data-plumbing-audit.md` como "aplazados a v17 explícitamente".

### Features no empezadas

| Feature | Estado | Notas |
|---|---|---|
| Holiday rates 1.5x (Holidays Act NZ) | ❌ No empezado | Compliance blocker para producción |
| HHRR Documents upload | ❌ No empezado | Necesita S3 o Supabase Storage |
| Leave management | ❌ No empezado | Calendario hardcodeado |
| Route optimization (Logistics) | ❌ No empezado | RoutesTab es stub |
| Manual entry fallback (scanner) | ❌ No empezado | Sin fallback si QR falla |
| Android device testing | ❌ No ejecutado | Capacitor configurado, nunca probado en dispositivo |
| TeamDrawer completo (stats de equipo) | ⚠️ Stub accesible | UI básica, sin roster ni stats |
| Traducciones parciales (TO, TL, SM, MI, HI) | ⚠️ Parcial | TODO comments en locales |
| Logistics SLA thresholds reales | ⚠️ Parcial | Hardcoded 1.2x, 1.5x ratios |
| Rate limiter persistente (Edge Functions) | ⚠️ Deuda | In-memory → necesita Redis o Postgres |
| Índices DB faltantes | ⚠️ Deuda | bucket_records, daily_attendance, pickers |

---

## APÉNDICE — Advertencia sobre datos del sim

El sim carga **18.222 scans** (NZ timezone-aware) para Apr 8-14 en `bucket_records`. Este número es el correcto para el rango NZ: la query UTC-naive devuelve 15.730 porque omite scans de madrugada NZ (Apr 8 00:00-12:00 NZ = Apr 7 12:00-24:00 UTC).

La tabla `day_closures` está y seguirá vacía en el sim. No bloquea la aplicación principal — solo afecta las superficies de analytics que (antes del Paso 2) caen al fallback demo.
