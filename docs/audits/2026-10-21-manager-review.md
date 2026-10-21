# Revisión del rol Manager — 2026-10-21

Lista de problemas que encontró el dueño al entrar como manager en el servidor local
(rama `perf/season-load-sim`, seeds `00 → 2weeks → role_users → today`), con la causa
de cada uno en el código y la propuesta de arreglo. **No se ha tocado nada: este documento
es para decidir antes de empezar.**

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 1 | Logística del manager son dos páginas (panel + botón «Ver logística completa») | Regresión del commit `d5ce6e3` (2026-04-14) | M | Sí: qué formato de página única |
| 2 | «Costo por cubeta — tendencia 7 días» vacío con 2 semanas de datos | `getDailyTrendsV2` devuelve `costPerBin: []` desde que se escribió | S | No |
| 3 | En Ajustes, tarjetas con 3 líneas se estiran a la altura de la vecina | Grid CSS con `align-items: stretch` por defecto | XS | No |
| 4 | Idiomas: dejar inglés, español y francés | Hoy 7 idiomas (en, es, mi, sm, to, hi, tl); francés no existe | M | Sí: cuándo (ver nota) |
| 5 | El manager no decide a qué hora acaba el turno | `harvest_settings.shift_end_time` alimenta ETA, horas restantes, gráficas y calendario de RRHH | M–L | Sí: qué sustituye al fin de turno en los cálculos |
| 6 | Ajustes no deja elegir qué huerto, filas y variedad se recogen; «Variedades: —» | No hay «plan del día»; las variedades se leen de `orchards.crop_type` (vacío) en vez de las filas | L | Sí: alcance (huerto+variedad o también filas) |

---

## 1. Logística: una sola página

### Lo que se ve
En Manager → Logística sale un panel de salud (semáforo, gráfica de bins pendientes, SLA de
recogida, ranking de runners, feed de eventos) y abajo un botón «Ver logística completa» que
navega a `/logistics-dept`, la página del rol Logística. El manager tiene que saltar de página
para asignar un tractor, ver la flota o las solicitudes.

### De dónde viene el retroceso (buscado en GitHub)
Historia de `src/components/views/manager/LogisticsView.tsx` en `main`:

| Fecha | Commit | Formato |
|-------|--------|---------|
| 2026-02-15 | `495f7b6` | **«Logistics Hub», una página**: contadores de bins llenos/vacíos, botón «Solicitar recogida», alerta de bin lleno, lista de runners activos con estado (cola / cargando / hacia bin / volviendo) y filtro. ~200 líneas |
| 2026-02-28 → 2026-04-02 | `60b332e`, `4ad0ba8`, `a8c9d18`, `dfb5a53` | Mismo formato, va creciendo (~290 líneas) |
| **2026-04-14** | **`d5ce6e3`** «feat(i18n+tests): i18n round 3 sweep, parity fixes, test suite green 415/415» | **Reescritura**: se borran 329 líneas y queda el panel de solo lectura + `OpenFullLogisticsLink` (48 líneas). Se añaden `manager/logistics/*`, `useLogisticsHealth`, `logisticsMetrics/` |
| 2026-04-14 → hoy | — | Sin cambios de formato |

Es decir: el formato de página única duró de febrero al 14 de abril. El cambio llegó dentro
de un commit enorme de i18n y tests (415 archivos, el mensaje lo menciona de pasada como
«LogisticsView rewrite») y por eso pasó desapercibido. He comprobado 15 ramas remotas
(`feat/owner-decisions`, `fix/qc-logistics`, `improve/round4-5`, `fix/pilot-blockers`,
`v15-fix-blockers`, `lab/autonomous-2026-04-21`, …): todas tienen el mismo archivo que `main`.
No hay ninguna rama con un formato posterior distinto; lo único anterior es el Hub de febrero.

Dato relevante: la ruta `/logistics-dept` ya admite al manager (`routes.tsx`, `allowedRoles:
[LOGISTICS, MANAGER]`) y las pestañas (`FleetTab`, `RequestsTab`) tienen prop `readOnly`,
pero la página nunca la pasa: el manager entra con permisos de escritura completos.

### Propuesta
**Opción A (recomendada): la pestaña Logística del manager ES la página completa.**
`LogisticsView` del manager pasa a renderizar lo mismo que `LogisticsDept` (Flota /
Solicitudes / Bins / Historial, con `useLogistics`), y el panel de salud actual se queda como
sección «Resumen» arriba (o como primera pestaña). Se elimina `OpenFullLogisticsLink`. El rol
Logística sigue usando `/logistics-dept` tal cual; es el mismo componente con otro contenedor.
- Se reutiliza todo lo que hay; sin consultas nuevas.
- El manager no sale de su navegación (cabecera y barra inferior de manager).

**Opción B: restaurar el «Logistics Hub» de febrero** (`git show dfb5a53:…LogisticsView.tsx`).
Más simple visualmente, pero duplica lo que ya hace `LogisticsDept` (solicitar recogida,
estado de runners) con otro código, y perdería el panel de salud y el ranking.

Archivos: `LogisticsView.tsx`, `LogisticsView.test.tsx`, `manager/logistics/OpenFullLogisticsLink.tsx`
(borrar), `i18n logistics.full_view` (borrar en 7 idiomas), `pages/LogisticsDept.tsx` (extraer el
cuerpo a un componente compartido). Pruebas existentes de ambas vistas se adaptan.

---

## 2. Tendencia de coste por cubeta a 7 días vacía

### Lo que se ve
Insights → «Costo por Cubeta — Tendencia 7 Días» muestra «Sin datos de tendencia» aunque la
base tiene 14 días de cubetas y fichajes.

### Causa
`src/services/analytics-trends.service.ts`, `getDailyTrendsV2()` (línea 130):

```ts
return { totalBins, workforceSize, costPerBin: [], breakEvenCost };
```

con el comentario «`costPerBin = []` hasta Paso 3 (requiere daily_attendance +
harvest_settings)». El «paso 3» nunca se hizo. `useCostAnalytics.ts` (línea 53) hace
`setCostTrend(trends.costPerBin)` y `CostAnalyticsView` pinta el vacío. No es un fallo de
datos ni de la prueba de carga: el gráfico lleva vacío desde que existe.

### Propuesta
Calcular la serie diaria con el mismo motor de pago que ya usa el resto:
- `useWeeklyReport.ts` (línea 148) ya calcula `costPerBin` por día = ganancias / cubetas con
  `daily_attendance` + `harvest_settings` + `variety_rates` (el complemento al mínimo
  incluido).
- Mover ese cálculo a `harvestMetrics/weekly.ts` (función pura, con test) y que
  `getDailyTrendsV2` lo use para los 7 días pedidos, en vez de devolver `[]`.
- Consultas: cubetas por día (`bucket_daily_grades` o un `count` agrupado) y tramos del día,
  ambas con `fetchAllRows` y orden estable (regla del proyecto).

Resultado esperado con los seeds: 7 puntos (los 7 últimos días con cubetas), línea de
break-even ya existente.

---

## 3. Ajustes: tarjetas estiradas

### Lo que se ve
«Detalles del Huerto» (3 líneas) ocupa la misma altura que «Configuración de Cosecha» (10
campos) y deja un hueco grande.

### Causa
`SettingsView.tsx` línea 82: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5`. CSS Grid
alinea cada fila con `align-items: stretch` por defecto: todas las tarjetas de una fila miden
lo que mide la más alta.

### Propuesta
Dos formas, elegir una al hacerlo:
- `items-start` en el grid (o `self-start` en `SettingsSection`): cada tarjeta mide lo suyo.
  Quedan huecos debajo, no dentro. Un cambio de una clase.
- Columnas tipo «masonry» (`columns-1 md:columns-2 lg:columns-3` + `break-inside-avoid`):
  las tarjetas cortas suben y rellenan. Mejor aprovechamiento, el orden visual pasa a ser
  por columna.

Además, reordenar para que las cortas (Huerto, Idioma) no caigan al lado de la más larga.
`SettingsView.test.tsx` no comprueba layout; sin riesgo.

---

## 4. Idiomas: inglés, español y francés

### Estado
- 7 idiomas en `src/i18n/locales/` (`en es mi sm hi to tl`), 1.649 claves por idioma, ~13.500
  líneas en total. `Locale` en `src/i18n/types.ts`, `SUPPORTED_LOCALES` en `src/i18n/index.ts`,
  chunk por idioma (lazy).
- No hay nada de idiomas en la base de datos (ni preferencia de usuario ni enum): el idioma
  vive en el navegador. Quitar idiomas no toca migraciones.
- Guardas en CI: `npm run i18n:check` (paridad de claves entre idiomas) y `english-smell`
  (detecta inglés en otros idiomas). Ambas obligan a que el francés esté completo.

### Propuesta (cuando el dueño diga)
1. Añadir `fr`: 1.649 claves nuevas (traducir desde `en` con `es` como referencia de tono),
   bandera, `Locale`, `SUPPORTED_LOCALES`, el cargador y el test `loader.test.tsx`.
2. Quitar `mi sm hi to tl`: borrar 5 carpetas, `Locale`, `SUPPORTED_LOCALES`, referencias en
   `WageShieldPanel.tsx` y tests que iteran idiomas (`check-i18n.test.ts`,
   `english-smell.test.ts`, `i18n-module.test.ts`).
3. Los usuarios que tuvieran guardado un idioma eliminado caen a `en` (el cargador ya hace
   fallback). Avisar en la nota de versión.

Nota: el dueño dijo «luego». Lo dejo como tarea aparte para no mezclarla con los arreglos
funcionales; se hace en su propia rama.

---

## 5. El fin de turno no lo decide el manager

### Lo que se ve
Ajustes → Configuración de Cosecha tiene «Inicio de turno» y «Fin de turno» (07:00–17:00).
En la práctica cada equipo y cada runner terminan a horas distintas; el fin de turno lo marca
el fichaje de salida de cada persona, no un ajuste del huerto.

### Dónde se usa hoy `shift_end_time`
| Uso | Archivo |
|-----|---------|
| ETA de la meta del día («a este ritmo se acaba a las …») | `DashboardView.tsx` → `analyticsService.calculateETA(…, shiftEndTime)` |
| Horas restantes / proyección de cubetas | `useHarvestMetrics.ts`, `harvestMetrics/projection.ts` |
| Ventana de la gráfica de velocidad por hora | `VelocityChart.tsx` |
| Gráfica de bins pendientes (eje hasta fin de turno) | `logistics/BinBacklogChart.tsx`, `useLogisticsHealth.ts` |
| Calendario de RRHH: descansos cada 2 h y comida, generados entre inicio y fin | `useOrchardSchedule.ts`, `hhrr/CalendarTab.tsx` |
| Formulario de ajustes | `SettingsView.tsx`, `useSettings.ts` |

`shift_start_time` tiene además un uso de pago: `harvestMetrics/hours.ts` recorta las horas
derivadas de escaneos al inicio de turno. Ese se queda.

El dato real de fin de jornada ya existe: `daily_attendance` guarda un tramo por persona con
`check_in`, `check_out` y huerto (migración `20261012030000_shifts_and_variety_rates`), y la
nómina ya suma tramos por día.

### Propuesta
- **Quitar «Fin de turno» de Ajustes.** Dejar «Inicio de turno» como hora prevista de inicio
  (sigue haciendo falta para el recorte de horas y para el eje de las gráficas). Mantener la
  columna en la tabla (no se borran migraciones); dejar de leerla.
- **ETA y proyección**: sin hora de fin fija, la ETA pasa a ser «a este ritmo, la meta se
  alcanza a las HH:MM» (ritmo = velocidad de la última hora) y el estado adelantado/atrasado
  se calcula contra la hora prevista de llegada, no contra las 17:00. Horas restantes deja de
  mostrarse (o se muestra «hasta la meta»).
- **Gráficas por hora**: ventana desde inicio de turno hasta ahora (más 1 h), no hasta un fin
  fijo. `VelocityChart` ya tiene el modo «últimas 8 horas» sin fin de turno.
- **Calendario de RRHH**: los descansos se generan sobre el tramo real de cada persona
  (desde su `check_in`; el de comida a las 5 h si sigue fichada), en vez de sobre 07:00–17:00
  del huerto.
- **Fin de jornada por equipo**: hoy no hay «cerrar el día del equipo» de un golpe. Si el dueño
  lo quiere, el team leader ficha la salida de su equipo (una acción, N tramos) y el runner la
  suya; es una pantalla pequeña más y un endpoint de `manage-attendance` en lote.

Decisión que hace falta: ¿la ETA se calcula solo con el ritmo (sin hora límite) o el manager
pone una **meta de hora** del día (p. ej. «quiero acabar a las 15:00») que no es fin de turno
sino objetivo? Lo segundo conserva el semáforo adelantado/atrasado tal cual.

---

## 6. Ajustes: elegir qué huerto, filas y variedad se recogen

### Lo que se ve
«Detalles del Huerto» muestra un solo huerto por defecto, «Filas totales 27» y
«Variedades de fruta: —», sin forma de decir qué se recoge hoy.

### Causas
- **«Variedades: —»**: `useSettings.ts` lee `orchards.crop_type` (una sola cadena, añadida
  en abril como parche y vacía en los seeds). Las variedades reales están en
  `block_rows.variety` (en los seeds: Royal Gala filas 1–15, Braeburn 16–27) y los precios en
  `variety_rates`. Se lee el campo equivocado.
- **Un solo huerto**: el selector lista `orchards` sin borrar; con los seeds solo hay uno
  (`Sunrise Apple Orchard`). Con varios huertos el desplegable aparece, pero cambiarlo
  **cambia el huerto activo del manager** (`useHarvestStore.setState({ orchard })`), no «qué
  se recoge hoy».
- **No existe el plan del día**: la tabla `day_setups` (huerto, temporada, fecha, variedad,
  meta, precio, hora de inicio) existe desde el esquema v3 pero solo la escribe el asistente
  de alta (`setup.service.ts`) una vez; ninguna pantalla la lee ni la edita después. Lo que
  hoy hace de «plan» es `harvest_settings` (una fila por huerto, sin fecha): precio, mínimo,
  meta y variedad.
- Las filas ya tienen asignación de equipos (`row_assignments`, `RowAssignmentModal`, el
  manager mueve equipos de fila), pero no hay un «hoy se recogen estas filas».

### Propuesta: «Plan del día» del manager
Una sección nueva en Ajustes (o una tarjeta propia en el panel) que escribe en `day_setups`:
1. **Huerto(s)** que se recogen hoy — multiselección entre los huertos de la empresa.
2. **Variedad(es)** por huerto — de `block_rows.variety` (distinct), con su precio de
   `variety_rates` al lado.
3. **Filas** (opcional, alcance B) — del `RowGrid` que ya existe, marcar las filas abiertas
   hoy; el escáner avisa si una cubeta llega de una fila no abierta.
4. Meta de toneladas y hora prevista de inicio del día (hoy en `harvest_settings`, pasan a
   ser por día).

Lo que ya hay y se reutiliza: tabla `day_setups` (+ columnas `rows int[]` y `varieties text[]`
en una migración nueva), `setup.repository.ts`, `RowGrid`, `VarietyRatesEditor`,
`OrchardSelector`. Los paneles del día (Dashboard, Insights, Logística) filtran por el plan del
día en vez de por «el huerto activo».

**Mientras tanto, arreglo pequeño e independiente**: «Variedades de fruta» pasa a listar las
variedades distintas de `block_rows` del huerto («Royal Gala, Braeburn») y se quita
`crop_type` de la lectura. Media hora, sin migración.

Decisiones que hacen falta:
- Alcance A (huerto + variedad) o B (también filas).
- Si el plan del día sustituye a «huerto activo» del manager (un manager, varios huertos a
  la vez) o conviven.
- Si la hora prevista de inicio y la meta pasan a ser por día (en `day_setups`) o siguen por
  huerto.

---

## Orden propuesto (cuando des el visto bueno)

Cada punto en su rama corta sobre `main`, fusionada en 1–2 días, como acordamos.

1. **#2 tendencia 7 días** y **#3 layout de Ajustes** y **#6-mini variedades** — pequeños, sin
   decisiones, una rama `fix/manager-insights-settings`.
2. **#1 logística en una página** — rama `fix/manager-logistics-single-page`, tras elegir A/B.
3. **#5 fin de turno** — rama `feat/shift-end-by-person`, tras decidir qué sustituye a la ETA.
4. **#6 plan del día** — rama `feat/day-plan`, tras decidir alcance.
5. **#4 idiomas** — rama `chore/locales-en-es-fr`, cuando digas.

Lo que no bloquea y sigo haciendo mientras revisas los demás roles: pruebas en el servidor
local con los seeds y anotar lo que encuentres de Team Leader, Runner, QC, RRHH, Nómina,
Logística y Admin en este mismo documento.
