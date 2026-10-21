# Revisión por roles — 2026-10-21

Lista de problemas que encontró el dueño al entrar rol por rol en el servidor local
(rama `perf/season-load-sim`, seeds `00 → 2weeks → role_users → today`), con la causa
de cada uno en el código y la propuesta de arreglo. **No se ha tocado nada: este documento
es para decidir antes de empezar.** Parte A: Manager. Parte B: Team Leader.

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

## Orden propuesto (actualizado con el Team Leader)

1. `fix/manager-insights-settings` — #2, #3, #6-mini (sin decisiones).
2. `fix/manager-logistics-single-page` — #1 (decidido).
3. `fix/tl-picker-drawer-map` — #7 y #8 (tras confirmar que «tabla de carga» = mapa de calor).
4. `feat/timesheet-batch-correct` — #9 (tras decidir alcance del TL).
5. `feat/shift-end-by-person` — #5 (decidido).
6. `feat/day-plan` — #6 (tras decidir alcance).
7. `feat/my-account` — #10 (tras decidir datos editables).
8. `chore/locales-en-es-fr` — #4 (cuando digas).
