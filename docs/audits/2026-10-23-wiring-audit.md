# Auditoría de botones, tablas y comunicación entre roles — 2026-10-23

**Pregunta del dueño:** ¿los botones de todos los roles funcionan de verdad, están bien conectados, cada
rol usa las tablas que debería, están conectadas a la app real y se comunican con la contraparte?

**Cómo se ha revisado** (rama `integration/2026-10-22` = `main` + prueba de carga #67 + Manager #68 + QC #69
+ RRHH #72 + Mi cuenta #73; Runner #70 y Team Leader #71 aparte):
1. **Código**: 456 controles distintos seguidos uno a uno hasta su destino (tabla, función de la base,
   Edge Function, almacenamiento o cola sin conexión), y comprobados contra las columnas y las reglas de
   acceso (RLS) reales de la base.
2. **App real**: Supabase local + la app en el navegador, entrando con cada rol: 601 controles pulsados en
   72 pantallas (más 31 a mano) mirando cada petición y su respuesta, y 16 flujos entre roles con dos
   sesiones abiertas a la vez. La base de demo se restauró al terminar.

## Respuesta corta

- **Los botones, en su gran mayoría, sí funcionan y van a la tabla correcta**: 403 de 456 en el código
  y 412 OK en la prueba real. Cada rol usa sus tablas y están conectadas a la base real (nada de datos
  inventados en las pantallas principales).
- **Lo que falla es la comunicación entre roles**: de 16 flujos, 3 van perfectos y en vivo (cubetas,
  chat, asignar fila), 9 van a medias (el dato se guarda pero el otro rol no se entera o solo al
  recargar) y 4 están rotos.
- **Hay 4 fallos de seguridad o de dinero** que conviene arreglar antes que nada (sección A).
- **Encontré y arreglé ya** una regresión mía: «Aprobar todas» de Nómina daba siempre error 400 porque
  el commit `0bfab88f` de la prueba de carga había devuelto 5 Edge Functions a su versión vieja. Está
  arreglado en `0a4188fd` (PR #67, CI en verde, comprobado en vivo: aprueba 2 hojas de golpe) y
  fusionado en la rama de integración.

| | Código (456) | App real (601 + 31) |
|---|---|---|
| Funciona | 403 (+9 con fallo menor) | 412 |
| Maqueta (hace como que funciona) | 9 | incluidos en «no hace nada» |
| No hace nada | 2 | 51 (algunas son pestañas ya activas) |
| Roto / error | 6 | 1 en el barrido (+ los de los flujos) |
| Bloqueado por las reglas de la base | 6 | — |
| No funciona sin cobertura | 2 | — |

## A. Seguridad y dinero (arreglar primero)

| # | Fallo | Prueba | Arreglo propuesto |
|---|---|---|---|
| A1 | **Un usuario desactivado sigue entrando y leyendo datos.** El admin lo desactiva (`users.is_active=false`) pero en Auth no se bloquea: entra, su sesión abierta sigue y lee pickers. Solo las escrituras dan 403. | Flujo 13 con `qc@` | `manage-admin` al desactivar: `auth.admin.updateUserById(id, { ban_duration })` y cerrar sesiones; al reactivar, quitar el ban. Y las RLS de lectura exigir `is_active_member()`. |
| A2 | **El team leader corrige fichajes de otros equipos.** Su Timesheet lista todo el huerto y `manage-attendance` lo acepta (corregí a una persona de otro equipo). Además una política vieja (`attendance_update_policy`) deja actualizar fichajes de cualquier huerto. | App real + RLS | `manage-attendance` (check-out, correct, correct_batch): si es TL, comprobar `pickers.team_leader_id = yo`. Migración que borra `attendance_update_policy`. #71 lo limita en pantalla, falta el servidor. |
| A3 | **Una hoja aprobada se puede corregir y sigue «aprobada»**; también se aprueba un turno abierto de 0,0 h. Nómina pagaría unas horas que nadie revisó. | Flujos 3 y 4 | Al corregir, quitar la aprobación (`verified_by/at` a null, como ya hace el trigger con el rechazo). `review_timesheet` rechaza aprobar si `check_out` es null. |
| A4 | **Cambiar el precio por cubeta recalcula toda la semana abierta hacia atrás** ($19.403 → $22.474 en la prueba). Las tarifas no tienen fecha de inicio. | Flujo 11 | Tarifas con fecha (`effective_from` en `harvest_settings`/`variety_rates`, o historial) y el cálculo usa la tarifa vigente el día de cada cubeta, igual que el salario mínimo (`NZ_MIN_WAGE_HISTORY`). Hasta entonces, aviso en Ajustes: «cambia el pago de toda la semana abierta». |
| A5 | **Reglas de acceso más anchas de lo debido**: cualquier rol puede cambiarse de huerto a sí mismo (así «logística por huerto» no es frontera); `variety_rates` no filtra por huerto (un manager cambia tarifas de otro); se puede crear una solicitud de transporte a nombre de otro; runner, QC y logística leen los fichajes de todo el huerto. | RLS de la base | Migración de RLS: cambiar de huerto solo a los huertos asignados; `variety_rates` por huerto; `transport_requests.requested_by = auth.uid()`; lectura de fichajes solo manager/TL de su equipo/RRHH/nómina y el propio. Con tests en `supabase/tests/security`. |

## B. Roto: el botón existe y no sirve

| # | Dónde | Qué pasa | Arreglo |
|---|---|---|---|
| B1 | Admin / RRHH | **No se puede dar de alta a nadie desde la app**: el registro exige una invitación en `allowed_registrations` y ninguna pantalla la crea. Hoy solo con seeds/SQL. | Pantalla «Invitar» (email, rol, huerto) en Admin y RRHH; la RLS ya lo permite. |
| B2 | Manager › Ajustes › Cerrar el día | El registro de auditoría da 400 (columnas inexistentes) y no sale confirmación; tras recargar se puede pulsar otra vez (error por duplicado); TL y runner no se enteran. | Escribir el evento por `submit-audit-log`, leer `day_closures` al cargar y enseñar «Día cerrado» a todos. |
| B3 | Día cerrado | Bloquea cubetas pero **no las correcciones de fichajes** de ese día. | Trigger de día cerrado en `daily_attendance` como el de `bucket_records`. |
| B4 | Manager (primer arranque) | El asistente de inicio acaba en error: `setup_orchard_atomic` solo deja crear huertos al admin. | Para el manager: asistente de *configurar* su huerto (precio, variedades, meta), no de crearlo. |
| B5 | Manager › Ajustes | Guardar escribe la variedad «Cherry» en un huerto de manzanas (valor por defecto) → el runner ve «Full Cherry Bins»; el selector de huerto choca con la RLS al guardar; los 3 interruptores de cumplimiento no hacen nada; «Reset Today's Data» no tiene acción. | Quitar el valor por defecto `Cherry`; quitar el selector (el cambio de huerto es el de la cabecera); quitar o cablear los interruptores; quitar «Reset». |
| B6 | Logística › Flota y Bins | Conductor y estado del vehículo se editan y **no se guardan**; no hay alta de vehículos; Bin Inventory es solo lectura. `fleet_vehicles` solo se llena con seeds. | Conectar `onUpdateTractor`, alta/baja de vehículos (con tipo tractor/carretilla/camión), y cambiar estado de bins desde Logística. |
| B7 | Runner › Timesheet | Ve horas y pago de todo el huerto con lápices de editar; al guardar, 403 sin aviso. | Lo arregla #70 («Mi hoja»). |
| B8 | Team leader › Inicio | Un enlace lleva a una pestaña `profile` que ya no existe (pantalla en blanco). | Llevar a «Mi cuenta». |
| B9 | Team leader › ficha de picker | Guardar el estado lo rechaza la base en silencio; «Enviar mensaje» dice «enviado» y no envía. | Lo arregla #71 (quita ese modal y usa el cajón del manager). |
| B10 | Nómina | Rechaza una hoja **sin motivo**; el toast de error de «Aprobar todas» salía con icono de éxito. | Pedir motivo al rechazar; icono correcto. |

## C. Comunicación entre roles que no llega

| Flujo | Hoy | Debería |
|---|---|---|
| Runner escanea → manager, TL, nómina | **OK, en vivo < 1 s** | — |
| Chat manager ↔ TL | **OK, en vivo < 1 s** | — |
| Manager asigna fila → TL | **OK, en vivo** (pero «Filas activas» del TL enseña todo el huerto; #71 lo filtra) | — |
| Pase de lista del TL → nómina, RRHH, manager | Nómina solo al recargar; Teams del manager y RRHH no enseñan presencia | Presencia en Teams; nómina con realtime o refresco al volver a la pestaña |
| Nómina aprueba / rechaza → TL, manager | **Nadie lo ve** | Estado «aprobada / rechazada: motivo» en el Timesheet del TL y del manager |
| QC inspecciona → TL, manager | El TL **nunca** lo ve; el manager solo al abrir la ficha del picker; un rechazo no avisa a nadie | Aviso al TL y al manager en cada rechazo o criterio «mal»; vista de inspecciones de su equipo para el TL |
| Runner pide transporte → logística → runner | Logística lo ve en vivo (~2,5 s); el runner **no ve** si se lo asignaron o completaron | #70 añade «Mis solicitudes»; falta en vivo |
| Manager envía aviso (broadcast) | Solo llega a TL y runner aunque dice «todo el personal»; QC no lo ve; la campana no sube el contador | Elegir destinatarios al enviar (por defecto todos) y que la campana cuente |
| RRHH ausencia aprobada | Solo la ve RRHH. El TL la ve en el pase de lista como si estuviera; el manager tampoco; nómina no la usa | Marcar «de permiso» en el pase de lista y en Teams; no contarla como ausencia sin aviso |
| RRHH contrato → nómina | El cálculo sí usa la tarifa del contrato; el panel de nómina solo enseña 12 de 24 personas | Paginar o «ver todos» en el panel de nómina |
| Manager cambia precios → TL, runner | Solo al recargar | Realtime de `harvest_settings` |
| Cambio de nombre (Mi cuenta) → otros | Solo al recargar | Aceptable; o refresco al volver a la pestaña |
| Logística cambia un bin → runner | **No existe** la acción en Logística | Ver B6 |
| Notificaciones push | **No existen**: el código está pero nadie lo usa; con la app cerrada no llega nada | Registrar el dispositivo al entrar y llamar a `send-push` en rechazos de QC, avisos y solicitudes |

## D. Sin cobertura (la app tiene que funcionar offline y aquí no)

- **Pase de lista del TL**: entrada y salida van directas al servidor; sin red fallan. La cola de
  fichajes existe pero nadie la usa.
- **Bins del runner** (alta y cambio de estado): se pierden sin red.
- **Foto de QC sin red**: la inspección se guarda pero la foto se pierde.

## E. Maquetas y botones muertos

- Chat: «adjuntar archivo», «info del chat» no hacen nada; «nota de voz» solo cambia el icono.
- RRHH › Empleados: la fila y la flecha no abren nada.
- Manager › Anomalías: «descartadas» es una lista fija en el código.
- Manager › Informe semanal: «Generate PDF» no genera nada.
- Manager › «Link Staff» dice «0 staff» habiendo personal.
- Runner: la nota de calidad de cada cubeta es siempre «A» (el paso de calificar nunca aparece).
- Alta de picker: «hora de inicio» y «fila» se piden y no se guardan.
- Nómina › Historial de exportaciones: vive en el navegador, no en el servidor, y «Delete» borra sin preguntar.
- Logística › «Cancel request» cancela sin confirmar.

## F. Visual y avisos

- El panel de notificaciones queda **debajo** de las tarjetas del panel del manager.
- En modo oscuro varios títulos de Ajustes casi no se ven.
- Muchos guardados no enseñan confirmación (ausencia, contrato, nombre, asignar fila, fichaje, alta de picker, inspección de QC).
- Mensajes contradictorios tras cerrar el día («cubeta guardada» y «1 escaneo no aceptado» a la vez).
- Turnos de más de 24 h se aceptan y se pagan sin tope (una salida olvidada).

## G. Tablas: quién las usa

- **Bien conectadas** (lee y escribe quien debe): `bucket_records`, `daily_attendance`, `row_assignments`,
  `chat_messages`/`conversations`, `broadcasts`, `transport_requests`, `contracts`, `hr_documents`,
  `qc_inspections`, `harvest_settings`, `variety_rates`, `pay_weeks`, `pickers`, `users`, `orchards`,
  `rejected_scans`, `leave_requests` (solo RRHH, ver C).
- **Se leen y nadie las escribe desde la app** (solo con seeds): `harvest_seasons`, `orchard_blocks`,
  `block_rows`, `fleet_vehicles`, `allowed_registrations`. Para un cliente real hacen falta pantallas para
  crear temporada, bloques y filas, flota e invitaciones.
- **Muertas** (nadie las usa o se consultan vacías): `messages`, `quality_inspections` (se consulta en cada
  ficha y siempre vuelve vacía), `push_subscriptions`, `wage_rates`, `sync_conflicts`, `login_attempts`,
  `account_locks`; la vista `pickers_performance_today` está rota (siempre 0) y se consulta en cada pase
  de lista.

## Qué arreglan las ramas pendientes

- **#70 Runner**: B7 (hoja propia) y «mis solicitudes» de transporte. No arregla Flota (B6).
- **#71 Team Leader**: B9 y el filtro por equipo **en pantalla** (A2 sigue abierto en el servidor),
  correcciones en lote. No arregla B8, el pase de lista sin red, el botón de descanso ni ver el rechazo de nómina.

## Plan propuesto (por tandas, cada una en su rama)

1. **Seguridad y dinero**: A1, A2, A3, A5 + B3. Migraciones de RLS y cambios en `manage-admin`,
   `manage-attendance`, `review_timesheet`, con tests de seguridad.
2. **Fusionar #70 y #71** (terminar su revisión, que se cortó) y arreglar B8.
3. **Comunicación**: estado de aprobación en el Timesheet del TL/manager, avisos de QC, ausencias en el
   pase de lista y Teams, broadcast con destinatarios y contador, realtime de ajustes.
4. **Cosas rotas de pantalla**: B1 invitaciones, B2 cierre del día, B4 asistente, B5 Ajustes, B6 flota y
   bins, B10 motivo de rechazo.
5. **Sin cobertura**: pase de lista y bins por la cola offline; foto de QC guardada en el móvil.
6. **Tarifas con fecha** (A4): cambio de modelo de datos, merece su propia rama y decisión.
7. **Push**, maquetas (quitar o terminar), limpieza de tablas muertas y avisos visuales.

**Decisiones que necesito de ti:**
- A4: ¿un cambio de precio vale desde hoy, o desde una fecha que elige el manager?
- Las maquetas del chat (adjuntos, notas de voz): ¿se terminan o se quitan por ahora?
- ¿Quién puede invitar usuarios: solo admin, o también RRHH?
- Ausencias: ¿el TL puede pedirlas para su equipo desde el móvil, o solo RRHH las registra?

---
Informes completos (con archivo:línea, peticiones y capturas): auditoría de código y auditoría en la
app real, en `docs/audits/2026-10-23-wiring/` (`code-audit.md`, `live-app-audit.md`).
