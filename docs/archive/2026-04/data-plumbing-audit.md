# Data Plumbing Audit — harvestpro-nz
**Fecha:** 2026-04-15
**Contexto:** Regresión detectada en Informe Semanal: KPI cards = 0, charts = datos inventados.
**Estado:** Plan aprobado. Paso 1 en ejecución.

**Los 5 minors BUG-10 a BUG-14 quedan aplazados a v17 explícitamente.**

---

## Outputs SQL (ejecutados 2026-04-15)

Nota: `bucket_records` no tiene columna `bucket_count` — cada fila es 1 scan (1 cubeta).

```sql
-- Q1: ¿Tiene el sim datos para Apr 8-14?
SELECT COUNT(*) AS total_scans FROM bucket_records
WHERE scanned_at >= '2026-04-08' AND scanned_at < '2026-04-15';
```
**→ 15.730 filas**

```sql
-- Q2: ¿Hay datos para hoy Apr 15?
SELECT COUNT(*) AS total_scans FROM bucket_records
WHERE scanned_at >= '2026-04-15';
```
**→ 0 filas**

```sql
-- Q3: ¿Está day_closures poblada?
SELECT COUNT(*) FROM day_closures;
```
**→ 0 filas**

**Conclusión confirmada:** 15.730 scans en DB para Apr 8-14. Cero para hoy.
Cero cierres de día registrados. El análisis abajo es correcto.

---

## Diagnóstico raíz

### Dos fuentes de datos desalineadas

| Superficie | Fuente actual | Comportamiento observado |
|---|---|---|
| KPI cards (Cubetas, Horas, Mano de obra, Costo/cubeta) | `bucketRecords` del store Zustand, filtrado a `scanned_at >= medianoche NZ hoy` | Muestra **0** — correcto: no hay scans del 15 Apr en el sim |
| Charts Velocidad de Cosecha + Tamaño del Equipo | `analyticsService.getDailyTrends` → tabla `day_closures` | Muestra **demo data hardcodeada** — `day_closures` está vacía, cae al fallback |

### Por qué `day_closures` está vacía

`day_closures` solo se inserta cuando el manager presiona `DayClosureButton`
y confirma el cierre del día. En el sim de 14 días ningún test ejecutó ese
flujo → la tabla está vacía → `getDailyTrends` (línea 108:
`if (closures && closures.length >= 2)`) no cumple la condición → cae al
bloque hardcodeado (líneas 130-166).

**El refactor `check_in_time → check_in` no es el causante.** Esa ruta
no toca `daily_attendance` en el path KPI. Es un bug de arquitectura
preexistente que la sim expuso al no ejecutar cierres de día.

---

## Parte A — Eliminar el fallback hardcodeado en analytics-trends.service.ts

### Decisión: ¿qué hacer con `day_closures`?

**Opción 1 — Job nocturno (pg_cron):**
Descartada. Requiere Supabase Pro, introduce latencia de 24h.

**Opción 2 — Trigger en DB al insertar bucket_records:**
Descartada. Race conditions, complejidad injustificada para MVP.

**Opción 3 — On-the-fly desde `bucket_records` (ELEGIDA):**
- Los charts agregan directamente sobre `bucket_records` y `daily_attendance`.
- `day_closures` mantiene su rol: audit trail de cierre del día (compliance).
  Los charts dejan de depender de ella.
- `day_closures` = "snapshot de cierre", no "fuente de verdad analítica".
- Zero infrastructure adicional.

### Nuevo método: `getDailyAggregates`

```typescript
// analyticsTrendsRepository — nuevo método
async getDailyAggregates(orchardId: string, startDate: string, endDate: string) {
  // Agrega bucket_records por día en timezone NZ (no UTC)
  // JOIN daily_attendance para workforce count por día
  // Devuelve: { date: string, total_buckets: number, workforce_count: number }[]
}
```

SQL interno — truncar en NZ timezone para evitar bug BUG-10 análogo:
```sql
date_trunc('day', scanned_at AT TIME ZONE 'Pacific/Auckland')::date AS day_nz
```

### Estrategia de coexistencia (ajuste #3)

NO reemplazar `getDailyTrends` en sitio. Flujo seguro:

1. Crear `getDailyAggregates` en repository (Paso 1).
2. Añadir `getDailyTrendsV2` en service usando el aggregate (Paso 2).
3. Gatear con constante `USE_LIVE_AGGREGATES = true/false` en el service.
4. Verificar `WeeklyReport` y `CostAnalytics` en browser con flag ON.
5. Solo cuando ambas vistas estén verificadas: eliminar `getDailyTrends` viejo
   + bloque demo data en un commit separado.

### Eliminar bloque demo data (solo tras verificación)

```typescript
// Reemplazar líneas 130-166 de analytics-trends.service.ts por:
return {
  costPerBin: [],
  totalBins: [],
  workforceSize: [],
  breakEvenCost: 8.50,
};
```

### `getDailyBleed` — mismo tratamiento

Líneas 172-186 son 100% mock random (ni siquiera fallback, siempre inventado).
KPI de compliance NZ — no puede mostrar `Math.random()`.
Fix junto al Paso 3 (ver orden de ejecución).

### TrendChartCard — empty state

`TrendChartCard` debe manejar `data.length === 0` con estado vacío explícito.
Verificar que no rompe cuando los arrays llegan vacíos.

---

## Parte B — Reparar el rango de useWeeklyReport

### Problema actual

```typescript
// useWeeklyReport.ts:105
const today = new Date().toISOString().slice(0, 10); // UTC, no NZ
weeklySeries({ from: today, to: today, ... })         // solo HOY
```

El componente se llama "Informe Semanal" pero calcula KPIs de un solo día.

### Decisión: arreglar el rango (no el nombre)

**Definición de semana:** lunes NZ al día actual NZ inclusive.

Implementación con `Intl.DateTimeFormat.formatToParts` (ajuste #4) — mismo
patrón ya usado en `DashboardView.tsx:159-166`. Sin `date-fns-tz`
(no instalado), sin round-trip frágil de `toLocaleString`.

```typescript
function dateNZST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  // en-CA devuelve YYYY-MM-DD directamente
  return parts.map(p => p.value).join('');
}

function startOfWeekNZ(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday')?.value; // 'Mon'..'Sun'
  const daysFromMonday: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const offset = daysFromMonday[weekday ?? 'Mon'] ?? 0;
  const mondayMs = Date.now() - offset * 86_400_000;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(mondayMs));
}
```

### BLOCKER — KPI cards necesitan fetch directo a Supabase

`bucketRecords` del store solo contiene scans desde medianoche NZ hoy.
Con rango semanal, las KPI cards deben leer de Supabase directamente.
Nuevo método en repository: `getWeeklyBuckets(orchardId, from, to)`.
`useWeeklyReport` usa `useEffect` para ese fetch (no el store).

### Implicación UX

`totalBuckets` → "cubetas esta semana", `totalHours` → "horas esta semana".
Header del componente debe mostrar el rango: "lun 13 — mié 15 abr".

---

## Parte C — Auditoría de fuentes de datos del Manager

### Taxonomía

- **Live (hoy):** store Zustand. Correcto. Se actualiza por realtime + sync al montar.
- **Histórico:** NUNCA del store. Siempre Supabase directo.

### Tabla completa

| Componente | Tipo de dato | Fuente actual | Estado | Fuente correcta |
|---|---|---|---|---|
| DashboardView — KPI cards (bins hoy, labor, ETA) | Live (hoy) | Store Zustand | ✅ OK | — |
| DashboardView — VelocityChart | Live (hoy, por hora) | Store Zustand | ✅ OK | — |
| DashboardView — delta ayer vs hoy | Histórico (1 día) | Store Zustand | ❌ **Bug confirmado** | Supabase: `bucket_records` WHERE date = ayer NZ |
| WeeklyReportView — KPI cards | Histórico (semana) | Store Zustand (solo hoy) | ❌ **Bug** | Supabase: `bucket_records` rango semana |
| WeeklyReportView — Charts (binsTrend, workforceTrend) | Histórico (7 días) | Demo hardcodeado | ❌ **Bug** | `getDailyTrendsV2` → aggregate on-the-fly |
| CostAnalyticsView — Charts históricos | Histórico (7 días) | Demo hardcodeado | ❌ **Bug** | `getDailyTrendsV2` → aggregate on-the-fly |
| WageShieldPanel — Wage Bleed chart | Histórico (7 días) | Mock random (siempre) | ❌ **Bug** | Supabase: `daily_attendance` + `wage_rates` |
| HeatMapView — densidad de cosecha | Histórico | Supabase directo | ✅ OK | — |
| AnomalyDetectionView | Live | Store Zustand | ✅ OK | — |
| PerformanceFocus | Live (hoy) | Store Zustand | ✅ OK | — |
| GoalProgress | Live (hoy) | Store Zustand | ✅ OK | — |
| TimesheetEditor | Histórico | Supabase (Edge Fn) | ✅ OK | — |
| TeamDrawer / TeamLeaderCard | Live | Store Zustand | ✅ OK | — |

### Bugs confirmados: 5

1. **WeeklyReportView KPI cards** — rango debería ser semana, store solo tiene hoy
2. **WeeklyReportView Charts** — demo hardcodeado
3. **CostAnalyticsView Charts** — demo hardcodeado
4. **WageShieldPanel Wage Bleed** — mock random, nunca fue real (compliance)
5. **DashboardView delta ayer vs hoy** — `yesterdayStr` usa UTC, store no tiene ayer → siempre 0

---

## Orden de ejecución (revisado)

### Paso 1 — Repository: `getDailyAggregates` + integration test (ACTUAL)

Crear `analyticsTrendsRepository.getDailyAggregates()` que agrega
`bucket_records` por día en NZ timezone.

**Parada obligatoria:** antes de tocar `getDailyTrends`, el integration test
`tests/integration/analytics.supabase.test.ts` debe pasar contra los
15.730 scans reales. Sin ese test verde, no se avanza al Paso 2.

Test strategy (ajuste #1):
- Conecta al Supabase local real (no mock).
- Verifica que `getDailyAggregates(orchardId, '2026-04-08', '2026-04-14')`
  devuelve exactamente 7 entradas (una por día).
- La suma de `total_buckets` de las 7 entradas = 15.730.
- El breakdown por día es consistente (ningún día tiene 0 si el sim tiene datos para ese día,
  verificar contra la tabla de attendance del seed).

### Paso 2 — Service: `getDailyTrendsV2` + flag de coexistencia

Añadir `getDailyTrendsV2` usando `getDailyAggregates`.
Gatear con `USE_LIVE_AGGREGATES`. Verificar en browser antes de eliminar el viejo.

### Paso 3 — `getDailyBleed` real (subido de prioridad, ajuste #2)

Compliance NZ. Implementar query real sobre `daily_attendance` + `wage_rates`.
No puede seguir siendo `Math.random()`.

### Paso 4 — Parte B: rango semanal en `useWeeklyReport`

`startOfWeekNZ` con `Intl.DateTimeFormat.formatToParts`.
Fetch directo a Supabase para KPI cards semanales.

### Paso 5 — Delta ayer en DashboardView (en scope, ajuste #5)

`yesterdayCount` siempre es 0 porque:
- `yesterdayStr` = `.toISOString().split('T')[0]` (UTC, no NZ)
- El store solo carga desde medianoche NZ hoy → no tiene datos de ayer

Fix: añadir fetch puntual de COUNT de ayer NZ en `DashboardView` o en `storeSync`.
Verificado en browser con el sim (14 Apr tiene datos, 15 Apr no tiene).

### Paso 6 — Eliminar demo data + `getDailyTrends` viejo

Solo cuando Pasos 2-5 estén verificados en browser.
Commit separado. Tests actualizados.

---

## Archivos a modificar

```
src/repositories/analytics-trends.repository.ts     — getDailyAggregates (Paso 1)
tests/integration/analytics.supabase.test.ts         — integration test contra Supabase local (Paso 1)
src/services/analytics-trends.service.ts             — getDailyTrendsV2 + flag (Paso 2), getDailyBleed real (Paso 3)
src/hooks/useWeeklyReport.ts                         — rango semanal + fetch Supabase (Paso 4)
src/components/views/manager/DashboardView.tsx        — delta ayer real (Paso 5)
src/components/charts/TrendLineChart.tsx              — verificar empty state (Paso 2)
```

**No crear migración nueva para `day_closures`.**
La tabla mantiene su rol de audit trail. Solo deja de ser fuente de charts.

**BUG-10 a BUG-14 (v14 minors) → aplazados a v17.**
```
