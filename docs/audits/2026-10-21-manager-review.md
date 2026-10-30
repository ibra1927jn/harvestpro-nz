# Revisión por roles — 2026-10-21

Lista de problemas que encontró el dueño al entrar rol por rol en el servidor local
(rama `perf/season-load-sim`, seeds `00 → 2weeks → role_users → today`), con la causa
de cada uno en el código y la propuesta de arreglo. **No se ha tocado nada: este documento
es para decidir antes de empezar.** Parte A: Manager. Parte B: Team Leader. Parte C: Runner. Parte D: Control de calidad. Parte E: RRHH.

# Parte A — Manager

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 1 | Logística del manager son dos páginas (panel + botón «Ver logística completa») | Regresión del commit `d5ce6e3` (2026-04-14) | M | **Decidido (21-10): juntar las dos páginas en una** |
| 2 | «Costo por cubeta — tendencia 7 días» vacío con 2 semanas de datos | `getDailyTrendsV2` devuelve `costPerBin: []` desde que se escribió | S | No |
| 3 | En Ajustes, tarjetas con 3 líneas se estiran a la altura de la vecina | Grid CSS con `align-items: stretch` por defecto | XS | No |
| 4 | Idiomas: dejar inglés, español y francés | Hoy 7 idiomas (en, es, mi, sm, to, hi, tl); francés no existe | M | Sí: cuándo (ver nota) |
| 5 | El manager no decide a qué hora acaba el turno | `harvest_settings.shift_end_time` alimenta ETA, horas restantes, gráficas y calendario de RRHH | M–L | **Decidido (21-10): fuera, sin sustituto; cada persona ficha su salida** |
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

### Decisión del dueño (21-10)
«Coger lo que hay en esas dos páginas y hacerlo en una.» Es la opción A de abajo. El dueño
recuerda el formato de una página de más cerca (hacia agosto) que lo que muestra el historial
de `main`; da igual para el arreglo, el resultado es el mismo.

### Propuesta
**Opción A (elegida): la pestaña Logística del manager ES la página completa.**
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

### Decisión del dueño (21-10)
No lo sustituye nada: cada persona se administra a sí misma y ficha su salida. Por tanto:
- Se quita «Fin de turno» de Ajustes y de todos los cálculos de la tabla de arriba.
- La ETA pasa a ser solo por ritmo («a este ritmo, la meta se alcanza a las HH:MM»); el
  semáforo adelantado/atrasado desaparece, no hay hora límite contra la que medir.
- «Horas restantes» se quita del panel.
- Las gráficas por hora van desde el inicio de turno hasta ahora.
- El calendario de RRHH genera los descansos sobre el tramo real de cada persona.
- No se añade ninguna «hora objetivo» del día.

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
2. **#1 logística en una página** — rama `fix/manager-logistics-single-page` (opción A, decidida).
3. **#5 fin de turno** — rama `feat/shift-end-by-person` (sin sustituto, decidido).
4. **#6 plan del día** — rama `feat/day-plan`, tras decidir alcance.
5. **#4 idiomas** — rama `chore/locales-en-es-fr`, cuando digas.


---

# Parte B — Team Leader

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 7 | Pulsar un picker no hace nada (en Manager sale la tarjeta lateral) | Las tarjetas de Inicio no tienen `onClick`; el cajón de perfil (`PickerDrawer`) solo está montado en la página del manager | S | No |
| 8 | Mapa: cambiar al formato del manager sin la «tabla de carga» | El TL solo ve el mapa de calor (`HeatMapView`) en un marco de 45 vh; el táctico con equipos por fila existe pero no se le muestra | M | Confirmar qué quitar (mapa de calor) |
| 9 | Timesheets de uno en uno: poder corregir varios o todos a la vez | `TimesheetEditor` edita una fila por vez y `manage-attendance` corrige un `attendance_id` por llamada; además al TL le sale el huerto entero, no su equipo | M | Sí: alcance del TL (su equipo o el huerto) |
| 10 | Falta una zona de usuario personal (foto, datos) en todos los roles | Solo Manager y TL tienen algo al pulsar el avatar; el del TL es una maqueta de solo lectura. No hay columnas de foto, teléfono ni datos personales en `users` ni `pickers` | L | Sí: qué datos y quién los edita |

## 7. Pulsar un picker no abre nada

### Lo que se ve
En Inicio del team leader, las tarjetas del ranking del equipo (los 5 primeros) no responden
al toque. En Manager, cualquier picker abre un cajón lateral con Hoy / Historial / Calidad.

### Causa
- El cajón del manager es `src/components/PickerDrawer/` (pestañas Hoy, Historial 14 días,
  Calidad, con insignias de riesgo; ya distingue picker / team leader / runner). Se abre con
  `openPickerProfile(id)` del store (`stores/slices/uiSlice.ts`) y está montado **solo** en
  `pages/Manager.tsx` (`<PickerProfileDrawer />`). `pages/TeamLeader.tsx` no lo monta.
- `team-leader/HomeView.tsx` (línea 162): las tarjetas del ranking son `<div>` sin `onClick`.
- `team-leader/TeamView.tsx` (pestaña «Equipo», que no está en la barra inferior; se llega
  desde «Ver equipo» en Inicio) sí abre algo, pero es el modal antiguo `PickerDetailsModal`,
  otro componente distinto del cajón del manager.
- `team-leader/AttendanceView.tsx` (Pase de lista): filas sin toque.

### Propuesta
- Montar `<PickerDrawer />` en `pages/TeamLeader.tsx` igual que en Manager.
- En Inicio, Equipo y Pase de lista: tocar un picker → `openPickerProfile(picker.id)`.
- Retirar `PickerDetailsModal` de `TeamView` (un solo componente de perfil para los dos roles).
- Los datos del cajón (`usePickerDrawerData` → cubetas, fichajes, QC del huerto) ya los puede
  leer el TL por RLS (miembro del huerto); no hace falta política nueva. Comprobarlo con el
  test de seguridad existente.

## 8. Mapa del team leader

### Lo que se ve
La pestaña «Mapa» muestra arriba un mapa de calor (celdas por fila coloreadas por cubetas,
con filtros hoy / 7 días / 30 días) y debajo objetivo mínimo, mis filas, última alerta y
filas asignadas. Al TL le interesa: en qué fila está su equipo y en qué filas están los otros.

### Causa
`team-leader/TasksView.tsx` incrusta `manager/HeatMapView` (352 líneas, densidad de cubetas)
en un `h-[45vh]`. El manager tiene `MapToggleView` con tres modos: **Táctico**
(`OrchardMapView`: bloques → filas → avatares de pickers, con el team leader marcado),
**Calor** (`HeatMapView`) y **Lista** (`RowListView`). El TL solo recibe el de calor, que es el
que menos le dice (cubetas por fila, no quién está dónde). «Tabla de carga» = el modo Calor.

### Propuesta
- `TasksView` pasa a mostrar `OrchardMapView` (el táctico) a pantalla completa en vez del mapa
  de calor, con dos realces: las filas donde está **mi equipo** (color del rol TL) y las filas
  con **otros equipos** (gris, con el nombre del team leader). Sin modo Calor ni Lista.
- `useOrchardMap` ya calcula pickers por fila y marca al team leader (`RowCard.tsx` línea 24);
  falta solo el agrupado por equipo (`selectTeamOf` ya existe) y el resalte.
- Se mantienen debajo «Mis filas» (`RowHistory`) y «Filas activas» con el botón Asignar. La
  lista «Filas activas» hoy enseña las asignaciones de **todo el huerto**
  (`useHarvest().rowAssignments`): filtrar a las del propio equipo, con las de los otros
  equipos solo en el mapa.
- Lo que se quita: `HeatMapView` del TL, el widget de objetivo mínimo / precio (ya está en
  Inicio y Perfil).

## 9. Timesheets en lote

### Lo que se ve
La pestaña «Timesheet» del TL es el editor del manager: un día, una fila por fichaje, botón
«Editar» en cada una, formulario (entrada, salida, descanso, motivo) y guardar. Para arreglar
10 fichajes iguales hay que repetirlo 10 veces.

### Causa
- `manager/TimesheetEditor.tsx` (263 líneas) + `TimesheetRow.tsx`: estado `editingId` único,
  `saveCorrection(record)` por fila.
- `attendanceService.correctAttendance()` → Edge Function `manage-attendance` acción `correct`
  con **un** `attendance_id`, un motivo y auditoría (`timesheet_correction`). No hay acción en
  lote (sí la hay ya en `approve-timesheet`, `items[]` hasta 500, hecha el 21-10 para Nómina).
- Alcance: `getAttendanceByDate(orchardId, date)` trae **todo el huerto**; el TL ve y puede
  corregir fichajes de equipos que no son el suyo. El RLS lo permite (`Manage attendance`:
  team_leader en su huerto), pero las reglas de equipos del 16-10 dicen que el TL gestiona
  solo su equipo.

### Propuesta
- **Selección múltiple** en la tabla (casilla por fila + «todos» + «los que tienen aviso», p.
  ej. sin descanso de comida o sin salida), y un único formulario que se aplica a los
  seleccionados: fijar entrada / salida / descanso **o** aplicar la misma corrección relativa
  («salida a las 16:30 para todos», «descanso 30 min para todos»). Un motivo para el lote.
- `manage-attendance` acción nueva `correct_batch` (`items[]`, máx. 200, una fila de auditoría
  por fichaje, mismo esquema Zod en `_shared/security.ts`), con el mismo patrón que
  `approve-timesheet` (resultados por índice, errores por fila sin tirar el lote).
- Para el TL: filtrar el editor a los fichajes de **su equipo** (`getPickersByTeam`, como ya
  hace Pase de lista). El manager sigue viendo el huerto entero.
- Offline: la corrección se encola como ahora (tipo `attendance` en la cola de Dexie, hallazgo
  13 de la auditoría de carga sigue pendiente).

Decisión: ¿el TL corrige solo los de su equipo (recomendado, coherente con el 16-10) o todo el
huerto como hoy?

## 10. Zona de usuario personal (todos los roles)

### Lo que se ve
No hay dónde cambiar la foto, el teléfono o los datos personales. Al pulsar el avatar de la
cabecera: en Manager se abre Ajustes del huerto (no es personal); en Team Leader se abre
«Perfil»; en Runner, QC, RRHH, Logística, Nómina y Admin el avatar no hace nada.

### Causa
- `common/Header.tsx`: el avatar muestra iniciales (`appUser.full_name`) y solo es botón si la
  página pasa `onProfileClick`. Lo pasan `Manager.tsx` (→ Ajustes) y `TeamLeader.tsx` (→
  `ProfileView`). Los otros 6 roles no.
- `team-leader/ProfileView.tsx` (127 líneas) es una maqueta: comentario «Mocked for now»,
  selector de huerto deshabilitado, interruptor «modo offline» sin conectar, botón «Fin de
  jornada» sin `onClick`, pie «v1.2.0 • Build 2024». Solo funciona «Cerrar sesión».
- Datos: `users` tiene `email, full_name, role, orchard_id, team_id, is_active,
  privacy_consent_at` y nada más; `pickers` tampoco tiene teléfono ni foto. Los avatares de la
  app se generan con `utils/avatarUrl.ts` (servicio externo ui-avatars.com por nombre).
- Seguridad de cuenta: el 2FA se configura en `components/MFASetup.tsx` (forzado por
  `MFAGuard` a los roles privilegiados), pero no hay pantalla para volver a verlo o
  regenerarlo; la contraseña solo se cambia por enlace de correo (`resetPasswordForEmail`).
- Idioma: se elige en Ajustes del manager (sección Idioma) y en ningún sitio para el resto.

### Propuesta: «Mi cuenta», una pantalla común para los 8 roles
Un componente `common/account/AccountView` abierto desde el avatar de la cabecera en todas
las páginas (`ResponsiveLayout` lo pasa; se quita el `onProfileClick` especial del manager y
la maqueta del TL). Secciones:
1. **Foto**: subir / cambiar / quitar. Bucket privado `avatars` (mismo patrón que
   `hr-documents`, con URL firmada) y columna `users.avatar_url`. Cabecera y cajón de perfil
   la usan; si no hay foto, iniciales como ahora (sin ui-avatars externo, que además envía el
   nombre a un tercero).
2. **Datos personales**: nombre a mostrar, teléfono, idioma preferido. Columnas nuevas en
   `users` (`phone`, `preferred_locale`), migración nueva, RLS «cada uno edita lo suyo» (ya
   hay patrón: `No self attendance update` al revés).
3. **Seguridad**: cambiar contraseña (`supabase.auth.updateUser`, pidiendo la actual),
   ver / regenerar 2FA (reutiliza `MFASetup`), sesiones.
4. **Mi trabajo** (solo lectura): rol, huerto(s), equipo, ID de picker, y para quien cobra por
   cubeta su precio y mínimo (lo que hoy enseña la maqueta del TL).
5. **Preferencias de la app**: idioma (mover aquí la sección de Ajustes del manager),
   notificaciones push (hoy en Ajustes del manager, `notificationService.getPrefs`).
6. Cerrar sesión y versión real (`VITE_APP_VERSION`).

Decisiones que hacen falta:
- Qué datos personales edita cada uno y cuáles solo RRHH (p. ej. nombre legal, IRD, banco y
  visado se quedan en RRHH; teléfono y foto los edita cada uno).
- Si la foto es obligatoria para pickers (útil para pase de lista) o solo para usuarios con
  cuenta. Los pickers sin cuenta no entran en la app: su foto la subiría RRHH o el TL.


---

# Parte C — Runner

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 11 | Timesheet: salen todos los runners; debe salir solo el del usuario | Usa el `TimesheetEditor` del manager (todo el huerto, un fichaje por fila); además el runner no puede guardar correcciones (la Edge Function le devuelve 403) | M | Sí: ¿el runner ficha su propia entrada/salida? Hoy la regla lo prohíbe |
| 12 | Almacén: «hay que ver lo del almacén» | Pantalla de tres contadores (bins llenos / vacíos / en curso) con adornos sin función; no enseña bins ni solicitudes | M | Sí: qué tiene que mostrar |
| 13 | Mapa de runners: quién está en el huerto y qué hace cada uno (driver, runner, forklift) | La pestaña «Corredores» lista **pickers**, no runners; no hay dato de «qué hace» un runner ni de tipo de vehículo | L | Sí: cómo se sabe el tipo (driver / forklift / a pie) |

## 11. Timesheet del runner: solo el suyo

### Lo que se ve
La pestaña «Timesheet» del runner es el editor de fichajes del manager: todos los fichajes
del huerto del día, con botón «Editar» en cada uno.

### Causa
- `pages/Runner.tsx` (línea 119) monta `manager/TimesheetEditor` con `orchardId`, igual que el
  team leader. `getAttendanceByDate(orchardId, date)` trae el huerto entero y la política
  `Read attendance` (SELECT por huerto) se lo permite.
- Guardar no funciona para el runner: `manage-attendance` exige `admin | manager | team_leader`
  (`requireRole`, línea 32) → 403 **después** de rellenar el formulario. Y aunque pudiera, las
  políticas restrictivas `No self attendance insert/update/delete` (migración
  `20261013101000`) impiden que nadie toque su propio fichaje salvo admin.
- Fichar: `check_in` de `manage-attendance` rechaza `picker_id === user.id` («You cannot
  check yourself in», línea 55). Hoy al runner lo ficha el manager o un team leader.

### Propuesta
- Pestaña nueva **«Mi hoja»** (`runner/MyTimesheetView`): solo los tramos del usuario
  (`daily_attendance.picker_id = auth.uid()`), por semana de pago: entrada, salida, descanso,
  horas, estado (pendiente / aprobado), total de la semana. Solo lectura.
- Botón **«Pedir corrección»** en cada tramo: motivo + hora propuesta → aviso al manager y al
  team leader (mensaje del sistema, tabla `messages`), que la aplican desde su editor. Así
  se respeta «nadie se corrige a sí mismo» y queda auditoría.
- Quitar `TimesheetEditor` del runner.

Decisión del dueño: «cada runner se hace su timesheet». Dos lecturas:
- **(a)** El runner **ficha su propia entrada y salida** (y pide correcciones). Hay que
  relajar la regla del 13-10 para el rol runner: permitir `check_in` / `check_out` sobre uno
  mismo en `manage-attendance` y en las políticas restrictivas (solo insert de entrada y
  update de salida, nunca corregir horas pasadas), con auditoría. Los pickers siguen igual.
- **(b)** El runner **solo ve** su hoja y pide correcciones; fichar lo hace manager / TL como
  hoy. Sin cambio de seguridad.
Lo mismo valdría para el team leader (hoy tampoco puede ficharse a sí mismo).

## 12. Almacén

### Lo que hay hoy
`runner/WarehouseView.tsx` (165 líneas): tres contadores del huerto —bins llenos («listo» /
«esperando»), bins vacíos («crítico» si < 5), bins en curso— y el botón «Solicitar
transporte» (crea un `transport_request`). Los números salen del store (`inventory` =
tabla `bins`, refresco cada ≤ 5 min tras la prueba de carga).

Lo que no cuadra:
- Campana de notificaciones decorativa (sin `onClick`) y un avatar «Warehouse» pedido a
  ui-avatars.com (imagen externa, sin función).
- El texto «Transporte solicitado» aparece cuando hay más de 10 bins llenos, no cuando hay
  una solicitud real; el runner no ve el estado de **sus** solicitudes (pendiente / asignada
  / completada), que sí existe en `transport_requests`.
- No hay lista de bins (código, zona, estado, llenado) ni por zona; no se puede saber dónde
  están los llenos que hay que recoger.
- Con la base vacía de bins (seeds) se ve solo el estado vacío con el botón.

### Propuesta (a confirmar contigo qué quieres del almacén)
- Arriba: los tres contadores, sin adornos.
- **Mis solicitudes de transporte**: las del runner (`requested_by = auth.uid()`), con estado
  y vehículo asignado, y poder cancelar una pendiente.
- **Bins por zona**: lista agrupada por `bins.location.zone` con estado y llenado; los llenos
  primero. Toque → marcar «recogido» si es su tarea (hoy eso lo hace Logística en
  `BinsTab`; decidir si el runner también puede).
- Realtime: ya hay suscripción a `bins` y `transport_requests` en Logística
  (`useLogistics`, con el coalescado de 2 s de la prueba de carga); reutilizarla aquí.

## 13. Mapa de runners

### Lo que se ve
La pestaña «Corredores» (`runner/RunnersView.tsx`) se titula «equipo» y lista los **pickers**
fichados con su fila y cubetas; no sale ningún runner. No hay mapa en el rol runner.

### Causa
- `RunnersView` usa `selectPresentPickers(crew)` sin filtrar por rol: enseña pickers.
- No existe el concepto «qué está haciendo un runner». Lo que hay en datos:
  - `pickers.role`: `picker | runner | bucket_runner | team_leader` (sin driver ni forklift).
  - `fleet_vehicles`: `name, registration, zone, driver_id, status (active / idle /
    maintenance / offline), load_status, bins_loaded, max_capacity` — **sin tipo de
    vehículo** (tractor / forklift / camión).
  - `transport_requests`: `zone, bins_count, status, assigned_vehicle, assigned_by,
    completed_at`.
  - `bucket_records.scanned_by` + `row_number`: la última fila en la que un runner escaneó.
  - No hay GPS ni posición; la «posición» de un runner solo puede ser su última fila
    escaneada o la zona de su vehículo.
- El «Logistics Hub» de febrero (hasta `dfb5a53`) tenía estados de runner (en cola /
  cargando / hacia bin / volviendo) **derivados de `pickers.status`** con un mapeo fijo, no
  de lo que hacía de verdad.

### Propuesta: «Runners en el huerto» (sustituye a «Corredores»)
- **Quiénes**: runners fichados hoy (`pickers.role in (runner, bucket_runner)` con tramo
  abierto en `daily_attendance`).
- **Qué hace cada uno**, derivado de los datos, sin que nadie lo teclee:
  - **Driver**: es `driver_id` de un vehículo con `status = active` → «Tractor X · 5/8 bins ·
    zona B» (y la solicitud en curso si tiene `assigned_vehicle`).
  - **Forklift**: igual, con un vehículo de tipo forklift → hace falta añadir
    `fleet_vehicles.type` (`tractor | forklift | truck`) en una migración nueva; Logística
    lo rellena en Flota.
  - **Runner a pie** (bucket runner): último escaneo < 10 min → «recogiendo · fila N»;
    sin escaneo en 15 min → «en espera»; sin vehículo ni escaneo → «sin actividad».
- **Mapa**: el táctico (`OrchardMapView`, el mismo que se propone para el team leader en #8)
  con un avatar de runner sobre su fila (a pie) o sobre la zona del vehículo (driver /
  forklift), y debajo la lista con el estado de cada uno. La misma pantalla puede servir en
  la pestaña Logística del manager (#1) como sección «Runners».
- Datos: una RPC `runners_now(orchard_id)` que junte pickers + tramo abierto + vehículo +
  último escaneo en una consulta (SECURITY INVOKER, RLS del huerto), refrescada por el
  realtime de `bins` / `transport_requests` ya existente y cada 60 s.

Decisiones que hacen falta:
- Tipo de runner: ¿se deriva del vehículo asignado (recomendado: ningún campo nuevo en la
  persona, un runner puede ser driver hoy y a pie mañana) o es un rol fijo de la persona
  (añadir `driver` y `forklift` a `pickers.role`)?
- Añadir `fleet_vehicles.type` (necesario para distinguir forklift de tractor).
- Si el runner también puede ver a los pickers de su zona (lo que hoy enseña «Corredores»)
  o solo a los runners.


---

# Parte D — Control de calidad (QC)

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 14 | Al seleccionar un picker ya no se puede deseleccionar; hay que elegir a otro | El toque siempre selecciona (`setSelectedPicker(picker)`), nunca alterna; además la lista enseña a los team leaders y solo a los 5 primeros | XS | No |
| 15 | La valoración es una sola nota (A/B/C/rechazo) + descripción; faltan los criterios reales (escaleras, daño al árbol, fruta en el suelo, llenado, calibre, fruta dañada) y las dos preguntas a la persona (informado, a gusto en el equipo) | `qc_inspections` solo tiene `grade, notes, photo_url`; las notas A/B/C son calidades de **fruta** (exportación / nacional / proceso), no de la forma de recoger | M–L | Sí: lista final de criterios, escala y quién ve las preguntas personales |

## 14. No se puede deseleccionar

### Causa
`qc/InspectTab.tsx` línea 170: `onClick={() => setSelectedPicker(picker)}`. `setSelectedPicker`
ya admite `null`, pero nadie lo llama con `null`. En modo Turbo, tras guardar, `onAutoAdvance`
(`pages/QualityControl.tsx` línea 86) pasa al siguiente de la lista, así que tampoco hay
forma de «ninguno».

Dos cosas más de la misma lista:
- `crew` viene del store sin filtrar por rol: aparecen los team leaders (en la captura,
  «Team Leader») como si fueran pickers a calificar.
- Sin búsqueda solo se enseñan los 5 primeros (`crew.slice(0, 5)`, línea 80), sin ordenar
  por quién está fichado ni por fila.

### Propuesta
- Tocar al seleccionado lo deselecciona; botón «×» en la tarjeta seleccionada; en Turbo, el
  avance automático se puede cancelar con el mismo toque.
- Lista: solo `role = picker` fichados hoy (`selectPresentPickers`), ordenados por fila, con
  los ya inspeccionados hoy marcados; «ver todos» en vez del corte en 5.

## 15. Qué se evalúa

### Lo que hay hoy
- Paso 2: cuatro botones **A (exportación) / B (nacional) / C (proceso) / Rechazo
  (descarte)**. Son grados de fruta para el mercado, no una valoración de cómo recoge la
  persona. Paso 3: notas libres y foto opcional (bucket `qc-photos`).
- Tabla `qc_inspections`: `orchard_id, picker_id, inspector_id, grade, notes, photo_url,
  created_at`. Sin criterios, sin fila, sin cubeta.
- Quién usa la nota: el cajón del picker (pestaña Calidad, puntuación 0–100 con A=100, B=70,
  C=40, rechazo=0 en `picker-history.service.ts`), la insignia de riesgo «caída de calidad»,
  las pestañas Estadísticas / Historial / Tendencias del QC, y un aviso al manager cuando hay
  rechazo (`notification.service`). **No afecta al pago**: lo que descuenta pago es la nota de
  la **cubeta** que pone el runner al escanear (`bucket_records.quality_grade = reject`,
  `pay.ts` línea 718), que es otra cosa.

### Lo que pide el dueño
Criterios de la inspección (por picker):
1. Uso correcto de las escaleras.
2. No corta demasiadas partes del árbol.
3. No hay muchas cerezas en el suelo.
4. Cubetas llenas (no a nivel bajo).
5. Calibre correcto en la mayor parte.
6. Pocas cerezas dañadas.

Y dos preguntas a la persona, que no son de calidad sino de cómo está:
7. ¿Está informado? (sabe qué variedad / qué calibre está recogiendo y cómo).
8. ¿Está a gusto en el equipo?

### Propuesta: inspección con lista de criterios
- **Pantalla**: Paso 2 pasa a ser la lista de 6 criterios, cada uno con tres estados (bien /
  regular / mal) de un toque, grandes, para hacerlo con guantes; abajo las dos preguntas
  (sí / no + comentario corto); foto y notas como ahora. La nota global **se calcula** de los
  6 criterios (p. ej. todo bien = A; un regular = B; un mal o dos regulares = C; dos males o
  escaleras mal = rechazo) para que todo lo que ya consume `grade` siga funcionando, y se
  enseña antes de guardar por si el inspector quiere cambiarla.
- **Datos**: migración nueva con `qc_inspections.criteria jsonb` (`{ladder: 'ok'|'warn'|'bad',
  tree_damage, fruit_on_ground, bucket_fill, size, damaged_fruit}`), `score int` (0–100),
  `row_number int` (fila donde se inspeccionó), `informed boolean`, `comfortable boolean`,
  `wellbeing_notes text`. `grade` se mantiene. Esquema Zod en `zod.schemas.ts` y en el
  procesador offline (`qc-inspection.processor.ts`).
- **Modo Turbo**: se mantiene con los 6 toques en vez de 1; el avance automático solo si los
  6 están marcados.
- **Informes**: Estadísticas pasa a enseñar también el criterio que más falla (del huerto y
  por equipo) — es lo que le sirve al manager y al team leader para corregir en el campo.
  El cajón del picker enseña sus últimos criterios en rojo.
- **Preguntas 7 y 8**: fuera de la puntuación. Se guardan con la inspección pero se enseñan
  en un sitio distinto: al team leader y al manager como aviso («2 pickers de tu equipo dicen
  no estar informados»), y a RRHH como lista. No entran en Estadísticas de calidad ni en la
  nota.
- **Etiquetas**: dejar de llamar a las notas exportación / nacional / proceso en la
  inspección de pickers (son de la cubeta); llamarlas Bien / Aceptable / A corregir /
  Grave, en los tres idiomas que queden.

Decisiones que hacen falta:
- Confirmar la lista de criterios y si alguno pesa más (escaleras es seguridad: ¿un «mal»
  en escaleras es rechazo directo?).
- Escala: tres estados por criterio (propuesto) o nota 1–5.
- Criterios 2 y 3 (daño al árbol, fruta en el suelo) se ven por **fila**, no por persona:
  ¿se apuntan al picker que está en esa fila o a la fila / equipo?
- Quién ve las preguntas 7 y 8 (propuesto: team leader, manager y RRHH; nunca en el perfil
  público del picker).


---

# Parte E — RRHH

| # | Problema | Causa | Tamaño | Necesita decisión |
|---|----------|-------|--------|-------------------|
| 16 | El filtro «Estado» solo tiene una opción («Activo»): no sirve para nada | Las opciones se sacan de los valores que hay en la lista, y el estado solo puede ser activo / baja (el modelo tiene `on_leave` y `pending` pero nunca se asignan) | S | No |
| 17 | Al crear un contrato no se puede subir el PDF firmado | El formulario tiene tipo, tarifa, inicio y fin; Documentos sube archivos pero no los enlaza al contrato | S–M | No |
| 18 | La Agenda no sirve si no se pueden gestionar los próximos días | La pestaña enseña solo el horario de **hoy** (entrada, descansos, salida, calculado del turno del huerto). No hay permisos, ausencias, días libres ni calendario; la tabla `leave_requests` no existe («placeholder» desde abril) | L | Sí: qué se gestiona (ausencias / permisos / disponibilidad / turnos) |
| 19 | RRHH en general es muy pobre | Seis pestañas con lo mínimo: lista, contratos, nómina resumida, documentos, horario de hoy, previsión de vencimientos | XL | Sí: prioridades de la lista de abajo |

## 16. Filtro «Estado» con una sola opción

### Causa
`hhrr/EmployeesTab.tsx` líneas 62–66: `statuses: [...new Set(employees.map(e => e.status))]` —
las opciones son los valores que hay en los datos. Y `hrLogic.ts` línea 66 pone
`status: person.active ? 'active' : 'terminated'`, así que con todos activos solo sale
«Activo». Igual en Contratos (`filterOptions.types/statuses`) y en Planificación.

### Propuesta
- Opciones fijas del dominio (`active`, `on_leave`, `terminated`, `pending`; visado:
  `work_visa`, `expired`, `not_recorded`), con el recuento al lado de cada una y las que
  tienen 0 en gris, no ocultas. `FilterBar` ya acepta la lista; es pasar el dominio en vez de
  lo que hay.
- Dar sentido a los estados: `on_leave` cuando hay una ausencia aprobada que cubre hoy (#18),
  `pending` para el alta sin contrato / sin documentos obligatorios (#19).

## 17. Subir el contrato firmado

### Causa
`hhrr/ContractsTab.tsx` líneas 266–287: el formulario de contrato nuevo solo pide tipo
(permanente / temporada / casual), tarifa por hora, inicio y fin opcional. La tabla
`hr_documents` (bucket privado `hr-documents`, tipos `employment_agreement`, `work_visa`,
`passport`, …) existe y Documentos sube archivos, pero **no hay enlace** entre el contrato y
su documento: `hr_documents` no tiene `contract_id`.

### Propuesta
- En el formulario de contrato: campo «Contrato firmado (PDF)» opcional; al guardar, se sube a
  `hr-documents` como `employment_agreement` con `contract_id` (columna nueva, migración
  nueva) y `expires_at = end_date`.
- En la tarjeta del contrato: icono «ver PDF» (URL firmada 5 min, ya existe) y aviso «sin
  copia firmada» cuando falta; también «Subir firmado» para contratos ya creados.
- Renovar un contrato pide el nuevo PDF (o lo deja pendiente con aviso).
- El resumen «Contratos pendientes» cuenta también los activos sin copia firmada, porque la
  ley exige tener copia del acuerdo (ver #19).

## 18. Agenda: gestionar los próximos días

### Lo que hay
`hhrr/CalendarTab.tsx` (82 líneas): «Horario de hoy» generado de `shift_start_time` /
`shift_end_time` del huerto (que además se van a quitar, #5) y un bloque «Próximas
ausencias» vacío con un comentario de que la tabla `leave_requests` no existe.

### Propuesta: Agenda = calendario de la plantilla
- **Ausencias y permisos**: tabla nueva `leave_requests` (persona, tipo: vacaciones / baja
  por enfermedad / duelo / violencia familiar / sin sueldo / día libre; desde, hasta,
  medio día, motivo, estado solicitado / aprobado / rechazado, quién aprueba, notas). La
  pide RRHH o el team leader por la persona (los pickers no tienen cuenta), la aprueba RRHH.
  Con «Mi cuenta» (#10) los que sí tienen cuenta (TL, runners, oficina) la piden ellos.
- **Vista de calendario** por mes y por semana: ausencias aprobadas, días libres,
  vencimientos de visado y de contrato, fin de temporada, festivos NZ (hay tabla de
  festivos en `constants/nz-law.ts`), y los descansos obligatorios solo como recordatorio.
- **Disponibilidad**: por persona, qué días de la próxima semana puede trabajar (lo rellena
  el TL en el pase de lista o la persona desde Mi cuenta). Sirve al manager para el plan del
  día (#6): cuántos pickers habrá mañana por equipo.
- **Efectos**: una ausencia aprobada pone `status = on_leave` ese día (#16), quita a la
  persona del pase de lista y del plan del día, y pasa a la nómina como día no trabajado
  (el pago de la ausencia lo calcula el programa de nóminas, como el holiday pay).

Decisión: ¿también turnos / cuadrantes (quién trabaja qué día en qué huerto) o solo
ausencias y disponibilidad? Lo segundo encaja con «cada persona se administra» (#5); lo
primero es un módulo grande (Droppah / RosterElf lo venden aparte).

## 19. RRHH en conjunto: qué hacen los demás y qué falta

### Lo que exige la ley NZ (employment.govt.nz, registro obligatorio)
- Por persona: nombre, dirección postal, edad si < 20, fecha de alta, tipo de trabajo, fecha
  de baja, **copia del acuerdo de empleo** (y si es colectivo, cuál).
- Registro de horas y salario por periodo de pago, con cómo se calculó, 6 años.
- Registro de vacaciones y permisos (fechas de derecho, saldos, días tomados y pagados,
  festivos trabajados / transferidos), 6 años.
- Entregar los registros al inspector de trabajo en 10 días hábiles; multas de $1.000 por
  infracción (hasta $20.000 por trimestre) y hasta $20.000 por incumplimiento para empresas.
- Buena práctica: contacto de emergencia, cuenta bancaria, datos del permiso de trabajo,
  constancia de descansos tomados.

### Qué ofrecen los programas del sector (PayHero, AgriSmart, RosterElf, Employment Hero)
- **Alta digital**: contrato desde plantilla, firma electrónica con estado (enviado / pendiente
  / firmado), IR330 (código de impuestos) y KiwiSaver (KS2) recogidos en el alta, comprobación
  de identidad y visado, inducción y políticas firmadas **antes del primer día**; recontratar
  a un temporero de la temporada pasada con un clic.
- **Expediente**: todos los documentos por persona con caducidad (visado, licencia, carnet
  de seguridad, certificados), avisos a 90 / 60 / 30 días, y bloqueo para asignar a quien
  tiene un documento caducado.
- **Permisos y saldos**: solicitud desde el móvil, aprobación viendo la cobertura, saldos de
  vacaciones / enfermedad / duelo / violencia familiar, aniversarios diferidos para temporeros
  con huecos entre temporadas, festivo «día que habría trabajado» por patrón real.
- **Horas**: fichaje por equipo desde el móvil del supervisor, carga en lote por equipo,
  descansos, GPS opcional, offline, y paso a la nómina (Xero / PaySauce) ya aprobado.
- **Pago a destajo** con complemento al mínimo automático, reglas RSE / PALM, alojamiento.
- **Seguridad y salud**: incidentes desde el campo, charlas de seguridad firmadas, registro
  de peligros.
- **Baja**: liquidación, vacaciones pendientes, devolución de material, encuesta de salida.
- **Retención 6 años** de horas, pago y permisos.

### Lo que HarvestPro ya tiene
Plantilla de la empresa (`pickers` + `users`), contratos (tipo, tarifa, fechas, renovar,
terminar), documentos con caducidad y alerta de visado, pase de lista y tramos por el TL,
nómina semanal con complemento al mínimo y export a Xero / PaySauce, 2FA, auditoría,
previsión de vencimientos a 90 días.

### Lo que falta, por orden de valor
1. **Expediente completo por persona** (una ficha, no seis pestañas): datos obligatorios
   (dirección, fecha de nacimiento si < 20, contacto de emergencia, IRD, código de
   impuestos, KiwiSaver, banco), documentos con caducidad, contratos con PDF (#17),
   permisos, historial de equipos y huertos, notas. Lista de «qué falta» por persona
   (semáforo de alta completa) → `status = pending` (#16).
2. **Alta guiada (onboarding)**: checklist por tipo de contrato (temporada / casual / RSE):
   acuerdo firmado, IR330, KS2, visado comprobado, inducción de seguridad, plan de cuidado
   pastoral (RSE), y recontratación de temporada anterior. Firma: subir el PDF firmado (#17)
   ahora; firma electrónica más adelante (necesita proveedor).
3. **Agenda / permisos / disponibilidad** (#18).
4. **Alertas de cumplimiento** unificadas: visado, contrato, documento caducado, alta
   incompleta, descansos no registrados, semanas sin complemento aplicado; con «resolver»
   y quién lo resolvió.
5. **Baja**: fecha de fin, motivo, documentos de salida, vacaciones pendientes para el
   programa de nóminas, material devuelto.
6. **Exportación para inspección**: por persona y rango de fechas, horas + pago + permisos
   en un PDF / CSV (la ley: 10 días hábiles).
7. **Seguridad y salud**: incidentes y charlas firmadas (más adelante).

Decisiones que hacen falta:
- Orden de los 7 puntos (propuesto: 1 → 2 → 3 → 4 → 5 → 6 → 7).
- Datos personales sensibles (IRD, banco, fecha de nacimiento): ¿se guardan en HarvestPro o
  solo en el programa de nóminas y aquí la casilla «entregado»? Guardarlos obliga a cifrado
  en reposo (ya hay AES-GCM en el cliente para la cola offline, pero no en tablas) y a una
  política de acceso solo RRHH.
- Firma electrónica: ¿subir PDF firmado (sin coste) o proveedor de firma (Dropbox Sign,
  DocuSign; de pago) más adelante?

---

## Nota del 21-10, 11:55

El dueño da por terminada esta primera pasada («muy superficial, pero te orienta») y pide
ponerse a ello esta noche siguiendo su visión. Lo que se hace sin esperar más decisiones:
los puntos sin decisión y los ya decididos, más una primera versión razonable de los que
tienen decisión pendiente, siempre en ramas cortas aparte con PR, sin fusionar a `main`
(eso lo hace él tras probarlo). Las decisiones tomadas por mi cuenta quedan apuntadas en
cada PR y aquí abajo.

---

## Orden propuesto (actualizado con Team Leader, Runner, QC y RRHH)

1. `fix/manager-insights-settings` — #2, #3, #6-mini, #14, #16 (sin decisiones).
2. `fix/manager-logistics-single-page` — #1 (decidido).
3. `fix/tl-picker-drawer-map` — #7 y #8.
4. `fix/runner-my-timesheet` — #11.
5. `feat/hr-contract-pdf` — #17.
6. `feat/timesheet-batch-correct` — #9.
7. `feat/qc-criteria` — #15.
8. `feat/shift-end-by-person` — #5 (decidido).
9. `feat/my-account` — #10.
10. `feat/hr-leave-calendar` — #18 (+ #16 `on_leave`).
11. `feat/runners-map` — #13 y #12.
12. `feat/day-plan` — #6.
13. `feat/hr-employee-file` — #19.1 y #19.2.
14. `chore/locales-en-es-fr` — #4 (cuando digas).
