# Auditoría dinámica de HarvestPro NZ: botones de los 8 roles y 16 flujos entre roles

Fecha: 2026-10-23. App: Vite en `127.0.0.1:5173` (rama `integration/2026-10-22`) contra el Supabase local.
Playwright headless, reloj del navegador fijo en `2026-10-22 13:45 NZDT`. Las cifras de controles salen del
barrido automático. Los flujos y las comprobaciones de botones destructivos y de permisos los he hecho con
scripts dirigidos.

Material:

- Resultados en bruto: `dyn/buttons.json` (601 controles, con su red, consola, toasts y modales).
- Flujos: `dyn/flow-f1.json` … `dyn/flow-f16.json`, más `dyn/flow-dpass*.json` (destructivos y permisos) y
  `dyn/flow-chatpass.json` (chat).
- Capturas en `dyn/shots/`.
- Scripts: `dyn/crawl.mjs`, `dyn/flows.mjs`, `dyn/dpass*.mjs`, `dyn/chatpass.mjs`.

## Aviso sobre el reloj (léelo antes que el resto)

El navegador va fijo al 22-oct a las 13:45, pero el servidor vive en la hora real (23-oct, 08:00–10:00 NZ).
Las Edge Functions `manage-attendance` y `record-bucket` y el `now()` de Postgres sellan con la hora del
servidor. Por eso:

- Las salidas que marca el TL quedan con turnos de 24–26 h.
- Algunos fichajes nuevos caen en la fecha 23-oct.
- El reloj de exposición al sol del runner sale negativo (`-7:-36:-18`).

Lo he tenido en cuenta en los veredictos. Aun así sirve de prueba real de que la app mezcla la hora del móvil y
la del servidor sin avisar, y lo apunto donde importa.

## Resumen

### Controles probados por rol y veredicto (barrido automático)

| Rol | Total | OK | NO HACE NADA | ERROR | MAQUETA | LENTO | DESHABILITADO | DESTRUCTIVO (no pulsado en el barrido) | NO LOCALIZADO | FALLO DE PRUEBA |
|---|---|---|---|---|---|---|---|---|---|---|
| manager | 221 | 159 | 23 | 0 | 0 | 0 | 8 | 4 | 23 | 4 |
| lead (team leader) | 54 | 47 | 5 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| runner | 12 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| qc | 36 | 15 | 2 | 0 | 0 | 0 | 8 | 0 | 3 | 8 |
| hr | 165 | 99 | 14 | 0 | 0 | 0 | 0 | 6 | 45 | 1 |
| payroll | 27 | 23 | 0 | 1 | 0 | 0 | 0 | 3 | 0 | 0 |
| logistics | 71 | 47 | 7 | 0 | 0 | 0 | 3 | 10 | 4 | 0 |
| admin | 15 | 11 | 0 | 0 | 0 | 0 | 0 | 1 | 3 | 0 |
| **Total** | **601** | **412** | **51** | **1** | 0 | 0 | 19 | 24 | 81 | 13 |

Además, con pruebas dirigidas:

- 31 controles de chat, de la pantalla Runners y del pase destructivo y de permisos.
- Los 16 flujos.

Ahí sí aparecen MAQUETAS y más ERRORES (ver abajo).

Cómo leer la tabla:

- **OK** quiere decir que «hace algo»: red, modal o cambio en pantalla. Que el dato guardado sea el correcto
  lo comprueban los flujos.
- **NO HACE NADA** incluye falsos positivos: pulsar la pestaña que ya está activa («Today» cuando ya es Today,
  «Heat» dentro de Heat…). Los reales están en la tabla por pantalla y en la lista de fallos.
- **NO LOCALIZADO** y **FALLO DE PRUEBA** son límites del barrido, no fallos de la app. Pasa con opciones de
  menús desplegables que se cierran al reiniciar la pantalla, con miembros de equipo tapados por la cabecera
  plegable y con tarjetas que cambian de texto.
- **DESTRUCTIVO**: no se pulsa en el barrido. Las acciones más importantes de ese tipo las probé a mano (ver
  la lista final).
- **ERROR** solo hay uno real en el barrido: «Approve all» de Nómina. Los demás «ERROR» automáticos eran
  `HEAD /rest/v1/pickers net::ERR_ABORTED`, que es una petición cancelada a propósito y no un fallo. Los
  reclasifiqué como OK.
- **«Update password»**: el «error» del modal «My account» en todos los roles es mi relleno de prueba
  («la nueva contraseña debe ser distinta»). Ahí la app hace lo correcto.

### Los 15 fallos más graves (con evidencia)

1. **Un usuario desactivado sigue entrando y leyendo datos** (flujo 13). El admin desactiva a `qc@`:
   `POST /functions/v1/manage-admin 200` y `users.is_active=false`, pero `auth.users.banned_until` sigue a
   `NULL`. Después:
   - El login entra hasta `/qc` sin problema.
   - La sesión que ya estaba abierta sigue funcionando tras recargar.
   - Con su token, `GET /rest/v1/pickers` devuelve datos. Solo las escrituras dan 403.
   - RRHH lo ve como «Terminated».

   Capturas: `shots/f13-qc-login.png`, `shots/f13-qc-open-session.png`.

2. **«Approve all» de Nómina no funciona nunca.** `POST /functions/v1/approve-timesheet 400`, con el error
   `{"expected":"string","path":["attendance_id"],"message":"Invalid input: expected string, received undefined"}`.
   - El cliente manda `{"items":[{attendance_id,current_updated_at},…]}` y la función solo acepta un
     `attendance_id` suelto.
   - El toast de error sale con el icono de éxito: «check_circle Could not approve 2 timesheets».
   - En otra ejecución no apareció ningún toast.

   Capturas: `shots/err-payroll-10.png`, `shots/f4-approve-all-error.png`.

3. **El team leader corrige fichajes de equipos que no son el suyo.** El Timesheet de `lead@` lista los
   pickers de todo el huerto. Con la cuenta de Hana corregí a Tane Williams, que es del equipo de Maria
   Aroha: `POST /functions/v1/manage-attendance 200` y en BD `corrected_by = Hana`. Va contra la regla de
   equipos de la migración `20261016000000_picker_team_rules`. Captura: `shots/d-tl-other-team.png`.

4. **Un timesheet aprobado se puede cambiar y sigue «aprobado».** Nómina aprobó el de Rawiri Thomas
   (`verified_at` a las 19:31) y el TL lo corrigió después (`corrected_at` 19:47, 07:00–13:00, 5,5 h). Sigue
   con `verified_at` y nómina lo sigue mostrando «VERIFIED» con las horas nuevas.
   - También se puede aprobar un turno abierto: tarjetas en «0.0 HRS · ACTIVE» con el botón APPROVE activo.

   Capturas: `shots/f3-payroll.png`, `shots/f4-pay-before.png`.

5. **Cerrar el día no bloquea las correcciones de fichajes** (flujo 16). Después de «End & Lock Day»
   (`day_closures` 2026-10-22 en estado `closed`):
   - Las cubetas sí se bloquean: van a `rejected_scans` con `INSERT_BLOCKED`.
   - Una corrección de Timesheet de ese mismo día se guarda: `manage-attendance 200`, Tane Williams con
     `corrected_at` 20:59:59.
   - `daily_attendance` no tiene un trigger equivalente a `trg_enforce_closed_day` (solo
     `trg_block_closed_pay_week_attendance`).

   Captura: `shots/f16-tl-ts.png`.

6. **El cierre del día no deja rastro en el Audit Log.** Al confirmar el cierre sale
   `POST /rest/v1/audit_logs 400 PGRST204 "Could not find the 'event_type' column of 'audit_logs'"`. Además
   no aparece ningún toast de confirmación. Captura: `shots/f16-after.png`.

7. **Logística no puede cambiar el estado de un bin** (flujo 14). La pantalla «Bin Inventory» es solo de
   lectura: el barrido encontró 1 control y ninguno en las tarjetas. El flujo «logística cambia un bin y el
   runner lo ve» no se puede hacer desde la interfaz. Captura: `shots/f14-bins.png`.

8. **Guardar Ajustes mete la variedad «Cherry» en un huerto de manzanas.** «Save Changes» escribe
   `harvest_settings.variety='Cherry'`, que antes estaba vacía. Viene del valor por defecto en
   `src/hooks/useSettings.ts:65` y `:121`. En el mismo sentido, el runner ve «Full Cherry Bins» y salen
   iconos 🍒 en el mapa de un huerto de Braeburn y Royal Gala. Captura: `shots/f11-settings-saved.png`.

9. **Cambiar el precio por cubeta recalcula hacia atrás toda la semana abierta** (flujo 11). Pasé el precio
   de 6,50 a 7,25 y Braeburn a 8,10:
   - En nómina, «Piece rate» de la semana del 19 al 25 de octubre pasó de **$19,403 a $22,474**, incluidos
     los días ya trabajados.
   - Maia Taylor pasó de $1,196 a $1,354.
   - El TL pasó de «PAY EST.» $2,246 a $2,697.

   Las tarifas no llevan fecha de inicio de vigencia. Capturas: `shots/f11-payroll-after.png`,
   `shots/f11-payroll.png`.

10. **El «broadcast» no llega a QC ni a oficina, y la campana no avisa** (flujo 7).
    - El modal dice «Send push notification to all staff», pero `broadcasts.target_roles` se guarda como
      `{team_leader,runner}` (es el valor por defecto en `src/hooks/useMessagingActions.ts:59`).
    - QC no lo ve ni recargando.
    - Al TL y al runner no les sube el contador de la campana. Solo lo ven si abren el panel.
    - `created_at` sale del reloj del móvil.

    Captura: `shots/f7-qc-panel.png`.

11. **El runner tiene la pestaña Timesheet con lápices de edición, y al guardar falla sin avisar.**
    `POST /functions/v1/manage-attendance 403 "Insufficient permissions. Required: admin|manager|team_leader. Got: runner"`,
    sin ningún toast. El runner cree que lo ha corregido. Captura: `shots/d-runner-timesheet.png`.

12. **Botones destructivos sin confirmación o que no hacen nada.**
    - «Cancel request» de Logística cancela al momento (`PATCH transport_requests 200`, de `pending` a
      `cancelled`). El barrido de la primera pasada canceló dos sin preguntar.
    - «Delete» del historial de exportaciones de Nómina borra sin preguntar, y ese historial vive solo en el
      `localStorage` del navegador (`harvestpro_export_history`): no se comparte entre dispositivos.
    - «Reset Today's Data» del manager no tiene `onClick` (`SettingsView.tsx:263`): no hace nada.

13. **El rechazo de QC no avisa a nadie** (flujo 5). La inspección «Reject» se guarda
    (`POST qc_inspections 201`, grade `reject`), pero:
    - La campana del manager sigue en «Notifications (4 unread)».
    - QC no recibe ningún toast de confirmación.
    - El dato solo aparece al abrir el cajón del picker («Low Quality… 7 rejects»).

    Capturas: `shots/f5-manager-notifs.png`, `shots/f5-manager-drawer.png`.

14. **El panel de notificaciones queda tapado.** En el Dashboard del manager, el panel de la campana queda
    debajo del aviso amarillo «1 saved with a doubtful time», de los botones Export y Live Map y de las
    tarjetas de cifras (problema de z-index). En modo oscuro, varios títulos de Ajustes son casi invisibles
    («Settings», «Harvest Configuration», «Orchard Details»…). Capturas: `shots/f5-manager-notifs.png`,
    `shots/screen-manager-Settings.png`.

15. **Maquetas y controles muertos en el chat y en RRHH.**
    - Chat: «Attach file» y «Chat info» no tienen manejador (`ChatWindow.tsx:98` y `:240`).
    - Chat: «Record voice message» solo cambia el icono y no graba nada (no hay `MediaRecorder`).
    - RRHH › Employees: la flecha `chevron_right` y la fila del empleado no hacen nada (0 nodos de
      diferencia, sin red).
    - TL: «Add New Picker» sí crea el picker (`POST pickers 201`, LOC-901), pero no sale ningún toast.

    Capturas: `shots/chat-manager-conv.png`, `shots/hr-employee-row-click.png`.

### Otros problemas encontrados (menos graves)

**Sin tiempo real.** Llegan solo al recargar:

- Horas de fichaje en nómina (flujos 2 y 3).
- Ausencias (flujo 9).
- Nombre nuevo del TL en Teams (flujo 15).
- Contratos (flujo 10).
- Precios del TL (flujo 11).

Lo que sí va en vivo:

- Chat: menos de 1 s.
- Peticiones de transporte en Logística: unos 2,5 s.
- Cubetas en el panel del manager y del TL: menos de 1 s.
- Asignación de fila en el mapa del TL: menos de 1 s.

**Cifras que no cuadran:**

- El contador del manager bajó un momento de 792 a 783 al llegar la cubeta por realtime. Al recargar marca
  793, que es lo correcto.
- En el mismo Dashboard, «Production 793» y «Velocity 821 total buckets».
- El mapa del manager dice «Block A 580 + Block B 241 = 821». La diferencia son 28 cubetas de cuatro
  «pickers» que en realidad son el personal: Sofia Ngata, James Tane, Tom Rangi y Maria Aroha.

**Visibilidad que falta:**

- Las ausencias aprobadas no se ven en el pase de lista del TL ni en Teams del manager (flujo 9).
- La aprobación de nómina no se ve en el Timesheet del TL ni en Teams (flujo 4).
- El runner no ve el estado de su petición de transporte en Almacén (flujo 6).
- El panel de nómina solo enseña 12 de los 24 trabajadores. Rua Hall, por ejemplo, no aparece, aunque
  `calculate-payroll` sí aplica su contrato de $35/h.

**Mensajes confusos:**

- Tras el cierre del día, el runner recibe a la vez «Bucket saved for Isla Anderson.» y «1 scan not accepted —
  tell your manager».
- Hay varios guardados sin toast: ausencia, contrato, nombre, asignación de fila, fichaje.
- Cuando el día del móvil y el del servidor no coinciden, «Check In» devuelve
  `200 {"already_checked_in":true}` y la pantalla no cambia ni avisa (`shots/f16-tl-checkin-after-close.png`).

**Datos raros en la portada del TL:**

- «Active Crew (4)» con 5 o más personas en la lista.
- Todas las personas en «ROW 6», que es la fila asignada al equipo. Aunque el manager las enseña con
  R3/R23, la app usa la fila del equipo.
- Turnos de más de 24 h aceptados y pagados (complemento de $612 en un día para Rua Hall) sin ningún tope ni
  bloqueo. Aquí lo provoca el desfase de reloj, pero en la vida real puede pasar con una salida olvidada.

**Resto:**

- «Link Staff» del manager dice «No staff found in the system. 0 staff» aunque hay personal.
- Las cuentas `runner1@`, `runner2@`, `tl1@` y `tl2@` **no** tienen la contraseña `111111`
  (`invalid_credentials`). Por eso el flujo 13 lo hice con `qc@`.
- El mapa de calor del TL enseña solo R1–R20, de las 27 filas.
- «Generate PDF» del informe semanal no genera ninguna descarga ni petición.

## Tabla por rol y pantalla (barrido automático)

Cada fila es una pantalla, con las pestañas internas o los filtros abiertos con «›». La columna de la derecha enseña los controles con un veredicto distinto de OK, o que escriben en la base, con su petición. Los enlaces de captura apuntan a `dyn/shots/`.

### Manager — 221 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-manager-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Dashboard | 24 | 24 | 0 | 0 | 0 | — |
| Dashboard › map Live Map | 7 | 4 | 2 | 0 | 1 | «strategy Tactical» NO HACE NADA<br>«Block B Braeburn trending_up In Progre» NO LOCALIZADO<br>«Today» NO HACE NADA |
| Dashboard › View all in Teams → | 16 | 14 | 0 | 0 | 2 | «SB Sofia Brown LOC-003 R27 41 bkt» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«NW Nikau Wilson LOC-006 R27 41 bkt» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.) |
| Dashboard › Manage Teams | 16 | 14 | 0 | 0 | 2 | «SB Sofia Brown LOC-003 R27 41 bkt» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«NW Nikau Wilson LOC-006 R27 41 bkt» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.) |
| Dashboard › View Insights & Analytics | 8 | 7 | 1 | 0 | 0 | «bar_chart Analytics» NO HACE NADA<br>«summarize Weekly Report» OK (POST fn:calculate-payroll 200)<br>«shield Fraud Shield» OK (POST fn:detect-anomalies 200) |
| Teams | 16 | 16 | 0 | 0 | 0 | — |
| Orchard Map | 10 | 3 | 2 | 0 | 5 | «strategy Tactical» NO HACE NADA<br>«arrow_back 🍒 Sunrise Apple Orchard» NO LOCALIZADO<br>«All (15)» NO LOCALIZADO<br>«🍒 Royal Gala (15)» NO LOCALIZADO<br>«R1 Royal Gala 🍒 29/100 5/hr AW» NO LOCALIZADO<br>«R2 Royal Gala 🍒 53/100 8/hr TW» NO LOCALIZADO<br>«Today» NO HACE NADA |
| Orchard Map › local_fire_department Heat | 10 | 6 | 2 | 0 | 2 | «local_fire_department Heat» NO HACE NADA<br>«today Today» NO HACE NADA<br>«R1 29% 29b» NO LOCALIZADO<br>«R2 53% 53b» NO LOCALIZADO |
| Orchard Map › list_alt List | 9 | 8 | 1 | 0 | 0 | «list_alt List» NO HACE NADA |
| Orchard Map › This week | 9 | 8 | 1 | 0 | 0 | «This week» NO HACE NADA |
| Logistics | 11 | 5 | 0 | 0 | 6 | «priority_high Priority expand_more» NO LOCALIZADO<br>«pending_actions Status expand_more» NO LOCALIZADO<br>«agriculture Assign Vehicle» NO LOCALIZADO<br>«Cancel request» NO LOCALIZADO<br>«agriculture Assign Vehicle» NO LOCALIZADO<br>«Cancel request» NO LOCALIZADO |
| Logistics › agriculture Fleet | 15 | 12 | 3 | 0 | 0 | «agriculture Fleet» NO HACE NADA<br>«A1» NO HACE NADA<br>«A2» NO HACE NADA |
| Insights | 8 | 3 | 1 | 0 | 4 | «bar_chart Analytics» NO HACE NADA<br>«summarize Weekly Report» OK (POST fn:calculate-payroll 200)<br>«shield Fraud Shield» OK (POST fn:detect-anomalies 200)<br>«1 Aroha Walker 41 bins · 6.1h $7.25/bi» NO LOCALIZADO<br>«2 Tane Williams 34 bins · 6.2h $7.25/b» NO LOCALIZADO<br>«1 Anika Robinson 41 bins · 25.8h $15.0» NO LOCALIZADO<br>«2 Emma Harris 42 bins · 25.9h $14.75/b» NO LOCALIZADO |
| Insights › summarize Weekly Report | 7 | 6 | 1 | 0 | 0 | «summarize Weekly Report» NO HACE NADA<br>«shield Fraud Shield» OK (POST fn:detect-anomalies 200)<br>«download Export Report» OK/SIN ESCRITURA (abre «download Export Report Choose sections a»; guardar «download Generate PDF»: sin red) |
| Insights › shield Fraud Shield | 9 | 7 | 2 | 0 | 0 | «summarize Weekly Report» OK (POST fn:calculate-payroll 200)<br>«shield Fraud Shield» NO HACE NADA<br>«Refresh anomalies» OK (POST fn:detect-anomalies 200)<br>«All Flags» NO HACE NADA |
| Messaging | 2 | 2 | 0 | 0 | 0 | — |
| Settings | 13 | 5 | 2 | 0 | 6 | «Save» DESHABILITADO<br>«Save» DESHABILITADO<br>«Toggle Enable Push Notifications» NO HACE NADA<br>«🇳🇿 English check_circle Active» NO HACE NADA<br>«save All Changes Saved» NO LOCALIZADO<br>«🔒 End & Lock Day» NO LOCALIZADO<br>«Reset» NO LOCALIZADO<br>«campaign Broadcast» NO LOCALIZADO |
| Settings › 🇪🇸 Español | 13 | 4 | 2 | 0 | 7 | «Guardar» DESHABILITADO<br>«Guardar» DESHABILITADO<br>«Activar/desactivar Estándares de Emple» DESTRUCTIVO (no pulsado en el barrido)<br>«Activar/desactivar Alertas de Salario » DESTRUCTIVO (no pulsado en el barrido)<br>«Activar/desactivar Verificación de Seg» DESTRUCTIVO (no pulsado en el barrido)<br>«Activar/desactivar Activar notificacio» DESTRUCTIVO (no pulsado en el barrido)<br>«🇪🇸 Español check_circle Activo» NO HACE NADA<br>«save Todos los Cambios Guardados» DESHABILITADO |
| Settings › 🇳🇿 Te Reo Māori | 15 | 8 | 3 | 0 | 4 | «Tiaki» DESHABILITADO<br>«Tiaki» DESHABILITADO<br>«Huri Whakahohe Pānui Pana» NO HACE NADA<br>«🇳🇿 Te Reo Māori check_circle Hohe» NO HACE NADA<br>«save Kua Tiakina ngā Panoni Katoa» DESHABILITADO<br>«🔒 Whakamutu, Raka i te Rā» OK (POST fn:calculate-payroll 200)<br>«🔒 Whakaū te Katinga» NO LOCALIZADO<br>«Tautuhi anō» NO HACE NADA |

### Team leader (lead@) — 54 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-lead-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Home | 5 | 5 | 0 | 0 | 0 | — |
| Home › VIEW ALL | 5 | 5 | 0 | 0 | 0 | — |
| Roll Call | 6 | 6 | 0 | 0 | 0 | «Check in Sofia Brown» OK (POST fn:manage-attendance 200)<br>«Check in Nikau Wilson» OK (POST fn:manage-attendance 200)<br>«Check out Emma Harris» OK (POST fn:manage-attendance 200)<br>«Check in Rawiri Thomas» OK (POST fn:manage-attendance 200)<br>«Check out Anika Robinson» OK (POST fn:manage-attendance 200)<br>«Check in Rua Hall» OK (POST fn:manage-attendance 200) |
| Map | 8 | 4 | 2 | 0 | 2 | «today Today» NO HACE NADA<br>«R1 29% 29b» NO LOCALIZADO<br>«R2 53% 53b» NO LOCALIZADO<br>«Today» NO HACE NADA |
| Map › date_range 7 days | 8 | 7 | 1 | 0 | 0 | «date_range 7 days» NO HACE NADA |
| Map › calendar_month 30 days | 8 | 7 | 1 | 0 | 0 | «calendar_month 30 days» NO HACE NADA |
| Map › This week | 8 | 7 | 1 | 0 | 0 | «This week» NO HACE NADA |
| Timesheet | 3 | 3 | 0 | 0 | 0 | — |

### Runner — 12 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 4 | 4 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-runner-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.»)<br>«Notifications» OK (POST rpc/my_unread_counts 200, POST rpc/last_messages 200) |
| Logistics | 3 | 3 | 0 | 0 | 0 | «local_shipping REQUEST REFILL» OK (POST transport_requests 201; toast «check_circle Bin request sent (Row 3) close»)<br>«crop_free SCAN BIN» OK/SIN ESCRITURA (toast «Scan bin Align QR code within frame close Problem scanning? »; abre «Scan bin Align QR code within frame clos»; guardar «Submit Code»: sin red / «info Bin AUDIT TEST active close»)<br>«label SCAN STICKER» OK/NO GUARDA (validación o nada) (toast «Scan bucket Align QR code within frame close Problem scannin»; abre «Scan bucket Align QR code within frame c»; guardar «Submit Code»: sin red) |
| Warehouse | 1 | 1 | 0 | 0 | 0 | «local_shipping REQUEST TRANSPORT» OK (POST transport_requests 201; toast «check_circle Bin request sent (Row 3) close») |
| Timesheet | 4 | 3 | 0 | 0 | 1 | «Dismiss notification» NO LOCALIZADO |

### QC — 36 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-qc-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Inspect | 13 | 4 | 1 | 0 | 8 | «check GOOD» DESHABILITADO<br>«remove SO-SO» DESHABILITADO<br>«YES» DESHABILITADO<br>«NO» DESHABILITADO<br>«photo_camera ATTACH VISUAL PROOF» NO HACE NADA<br>«Grade A (Good)» DESHABILITADO<br>«Grade B (Acceptable)» DESHABILITADO<br>«Grade C (Needs correcting)» DESHABILITADO |
| Inspect › SHOW ALL (6) | 14 | 4 | 1 | 0 | 9 | «TW Tane WilliamsID LOC-002 ROW 2 34 BK» NO LOCALIZADO<br>«check GOOD» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«remove SO-SO» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«YES» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«NO» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«photo_camera ATTACH VISUAL PROOF» NO HACE NADA<br>«Grade A (Good)» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.)<br>«Grade B (Acceptable)» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.) |
| History | 1 | 1 | 0 | 0 | 0 | — |
| History › grade Grade expand_more | 5 | 3 | 0 | 0 | 2 | «B» NO LOCALIZADO<br>«C» NO LOCALIZADO |

### RRHH — 165 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-hr-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Employees | 10 | 6 | 4 | 0 | 0 | «AM Alex Morgan ADMIN Active expand_mor» NO HACE NADA<br>«chevron_right» NO HACE NADA<br>«AR Anika Robinson PICKER Active expand» NO HACE NADA<br>«chevron_right» NO HACE NADA |
| Employees › badge Role expand_more | 13 | 7 | 2 | 0 | 4 | «HR (1)» NO LOCALIZADO<br>«AM Alex Morgan ADMIN Active expand_mor» NO HACE NADA<br>«chevron_right» NO HACE NADA<br>«AR Anika Robinson PICKER Active expand» NO LOCALIZADO<br>«Active expand_more» NO LOCALIZADO<br>«chevron_right» NO LOCALIZADO |
| Employees › toggle_on Status expand_more | 14 | 9 | 0 | 0 | 5 | «On Leave (1)» NO LOCALIZADO<br>«Pending (31)» NO LOCALIZADO<br>«Terminated (1)» NO LOCALIZADO<br>«Remove filter role» NO LOCALIZADO<br>«chevron_right» FALLO DE PRUEBA (locator.click: Timeout 3000ms exceeded.) |
| Employees › public Visa expand_more | 14 | 6 | 0 | 0 | 8 | «Expired (0)» NO LOCALIZADO<br>«Not Recorded (33)» NO LOCALIZADO<br>«AM Alex Morgan ADMIN Active expand_mor» NO LOCALIZADO<br>«Active expand_more» NO LOCALIZADO<br>«chevron_right» NO LOCALIZADO<br>«AR Anika Robinson PICKER Active expand» NO LOCALIZADO<br>«Active expand_more» NO LOCALIZADO<br>«chevron_right» NO LOCALIZADO |
| Contracts | 12 | 8 | 2 | 0 | 2 | «cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«upload Upload signed» NO HACE NADA<br>«upload Upload signed» NO HACE NADA |
| Contracts › description Type expand_more | 21 | 4 | 0 | 0 | 17 | «Seasonal (32)» NO LOCALIZADO<br>«Casual (1)» NO LOCALIZADO<br>«add CREATE CONTRACT» NO LOCALIZADO<br>«2027-03-31 edit» NO LOCALIZADO<br>«$ 23.95 /hr edit» NO LOCALIZADO<br>«autorenew RENEW» NO LOCALIZADO<br>«cancel TERMINATE» NO LOCALIZADO<br>«autorenew RENEW» NO LOCALIZADO |
| Contracts › toggle_on Status expand_more | 9 | 5 | 0 | 0 | 4 | «On Leave (1)» NO LOCALIZADO<br>«Pending (31)» NO LOCALIZADO<br>«Terminated (1)» NO LOCALIZADO<br>«Remove filter contract_type» NO LOCALIZADO |
| Contracts › add CREATE CONTRACT | 17 | 12 | 3 | 0 | 2 | «Seasonal Casual Permanent» NO HACE NADA<br>«Save contract» OK ([captura](dyn/shots/err-hr-101.png); POST contracts 201, POST fn:calculate-payroll 200, HEAD pickers 200; toast «check_circle Contract created for Alex Morgan — No signed co»)<br>«cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«Confirm renewal» OK ([captura](dyn/shots/err-hr-110.png); PATCH contracts 200, POST fn:calculate-payroll 200, HEAD pickers 200; toast «warning Contract renewed for Aroha Walker until 22 Oct 2027 »)<br>«upload Upload signed» NO HACE NADA<br>«upload Upload signed» NO HACE NADA |
| Contracts › 2027-03-31 edit | 15 | 12 | 1 | 0 | 2 | «cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«cancel TERMINATE» DESTRUCTIVO (no pulsado en el barrido)<br>«Seasonal Casual Permanent» NO HACE NADA<br>«Save contract» OK ([captura](dyn/shots/err-hr-124.png); POST contracts 201, POST fn:calculate-payroll 200, HEAD pickers 200; toast «check_circle Contract created for Audit Picker — No signed c») |
| Documents | 1 | 1 | 0 | 0 | 0 | «cloud_uploadUpload» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-hr-129.png); abre «Upload document Employee Choose a person»; guardar «Upload»: sin red / «Employee, file and title are required») |
| Calendar | 8 | 5 | 1 | 0 | 2 | «Month» NO HACE NADA<br>«add New leave» OK/VALIDACIÓN (relleno de prueba) (abre «New leave Person Anika RobinsonPicker Ar»; guardar «Save leave»: sin red / «Choose a person»)<br>«28» NO LOCALIZADO<br>«29» NO LOCALIZADO |
| Calendar › Previous | 10 | 6 | 0 | 0 | 4 | «add New leave» OK/VALIDACIÓN (relleno de prueba) (abre «New leave Person Anika RobinsonPicker Ar»; guardar «Save leave»: sin red / «Choose a person»)<br>«Cancel leave» NO LOCALIZADO<br>«Approve» NO LOCALIZADO<br>«Reject» NO LOCALIZADO<br>«Cancel leave» NO LOCALIZADO |
| Calendar › Next | 6 | 6 | 0 | 0 | 0 | «add New leave» OK/VALIDACIÓN (relleno de prueba) (abre «New leave Person Anika RobinsonPicker Ar»; guardar «Save leave»: sin red / «Choose a person») |
| Calendar › Week | 6 | 5 | 1 | 0 | 0 | «Week» NO HACE NADA<br>«add New leave» OK/VALIDACIÓN (relleno de prueba) (abre «New leave Person Anika RobinsonPicker Ar»; guardar «Save leave»: sin red / «Choose a person») |
| Planning | 1 | 1 | 0 | 0 | 0 | — |
| Planning › description Contract Type expand_more | 5 | 3 | 0 | 0 | 2 | «Seasonal (30)» NO LOCALIZADO<br>«Casual (2)» NO LOCALIZADO |

### Nómina — 27 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-payroll-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Dashboard | 4 | 4 | 0 | 0 | 0 | «Previous pay week» OK (POST fn:calculate-payroll 200)<br>«Next pay week» OK (POST fn:calculate-payroll 200) |
| Timesheets | 7 | 6 | 0 | 1 | 0 | «Previous pay week» OK (POST fn:calculate-payroll 200)<br>«Next pay week» OK (POST fn:calculate-payroll 200)<br>«APPROVE ALL (2)» ERROR ([captura](dyn/shots/err-payroll-10.png); POST fn:approve-timesheet 400; toast «check_circle Could not approve 2 timesheets»)<br>«check APPROVE» OK (POST fn:approve-timesheet 200; toast «check_circle Timesheet approved for Rawiri Thomas»)<br>«close REJECT» OK (POST fn:approve-timesheet 200; toast «check_circle Timesheet rejected for Lily Young»)<br>«check APPROVE» OK (POST fn:approve-timesheet 200; toast «check_circle Timesheet approved for Liam Smith»)<br>«close REJECT» OK (POST fn:approve-timesheet 200; toast «check_circle Timesheet rejected for Sofia Brown») |
| Wage Calculator | 2 | 2 | 0 | 0 | 0 | «Previous pay week» OK (POST fn:calculate-payroll 200)<br>«Next pay week» OK (POST fn:calculate-payroll 200) |
| Export | 6 | 6 | 0 | 0 | 0 | «Previous pay week» OK (POST fn:calculate-payroll 200)<br>«Next pay week» OK (POST fn:calculate-payroll 200) |
| History | 5 | 2 | 0 | 0 | 3 | «Previous pay week» OK (POST fn:calculate-payroll 200)<br>«Next pay week» OK (POST fn:calculate-payroll 200)<br>«Clear All» DESTRUCTIVO (no pulsado en el barrido)<br>«Delete» DESTRUCTIVO (no pulsado en el barrido)<br>«Delete» DESTRUCTIVO (no pulsado en el barrido) |

### Logística — 71 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-logistics-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Fleet | 10 | 8 | 2 | 0 | 0 | «A1» NO HACE NADA<br>«A2» NO HACE NADA |
| Fleet › local_shipping Status expand_more | 13 | 8 | 2 | 0 | 3 | «Idle» NO LOCALIZADO<br>«A1» NO HACE NADA<br>«A2» NO HACE NADA<br>«No driver edit» NO LOCALIZADO<br>«Idle expand_more» NO LOCALIZADO |
| Requests | 6 | 4 | 0 | 0 | 2 | «Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido) |
| Requests › priority_high Priority expand_more | 11 | 7 | 1 | 0 | 3 | «Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Select vehicle» NO HACE NADA<br>«Confirm» DESHABILITADO |
| Requests › pending_actions Status expand_more | 10 | 7 | 0 | 0 | 3 | «Remove filter priority» NO LOCALIZADO<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido) |
| Requests › agriculture Assign Vehicle | 18 | 10 | 2 | 0 | 6 | «Select vehicle» NO HACE NADA<br>«Confirm» DESHABILITADO<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Cancel request» DESTRUCTIVO (no pulsado en el barrido)<br>«Select vehicle» NO HACE NADA<br>«Confirm» DESHABILITADO |

### Admin — 15 controles

| Pantalla | Probados | OK | Nada | Error | Otros | Controles con problema / notables |
|---|---|---|---|---|---|---|
| Cabecera | 3 | 3 | 0 | 0 | 0 | «Open my account» OK/VALIDACIÓN (relleno de prueba) ([captura](dyn/shots/err-admin-3.png); abre «person My account close photo_camera PHO»; guardar «Update password»: sin red / «error New password must differ from the current one.») |
| Orchards | 1 | 1 | 0 | 0 | 0 | «add New Orchard» OK/NO GUARDA (validación o nada) (toast «rocket_launch New Orchard Setup Step 1 of 4 close park Creat»; abre «rocket_launch New Orchard Setup Step 1 o»; guardar «Next arrow_forward»: sin red) |
| Users | 5 | 1 | 0 | 0 | 4 | «person_off» DESTRUCTIVO (no pulsado en el barrido)<br>«Change role for Alex Morgan» NO LOCALIZADO<br>«person_off» NO LOCALIZADO<br>«Change role for David Chen» NO LOCALIZADO |
| Audit Log | 6 | 6 | 0 | 0 | 0 | — |

### Chat y pantalla Runners (prueba dirigida: el barrido no veía esos controles)

| Rol | Pantalla | Control | Veredicto |
|---|---|---|---|
| lead | Chat | Chats | NO HACE NADA |
| lead | Chat | Alerts | OK |
| lead | Chat | Search conversations | OK |
| lead | Chat | New chat | OK |
| lead | Chat › Block A crew | Chat info | OK |
| lead | Chat › Block A crew | Attach file | NO HACE NADA |
| lead | Chat › Block A crew | Reply | OK |
| lead | Chat › Block A crew | More | NO VISIBLE |
| lead | Chat › Block A crew | Record voice message | OK |
| lead | Chat › Block A crew | Quick replies | OK |
| runner | Chat | Chats | NO HACE NADA |
| runner | Chat | Alerts | OK |
| runner | Chat | Search conversations | OK |
| runner | Chat | New chat | OK |
| runner | Chat › Block A crew | Chat info | OK |
| runner | Chat › Block A crew | Attach file | NO HACE NADA |
| runner | Chat › Block A crew | Reply | OK |
| runner | Chat › Block A crew | More | NO VISIBLE |
| runner | Chat › Block A crew | Record voice message | OK |
| runner | Chat › Block A crew | Quick replies | OK |
| runner | Runners | Tarjeta Aroha Walker | NO HACE NADA |
| manager | Chat | Chats | NO HACE NADA |
| manager | Chat | Alerts | OK |
| manager | Chat | Search conversations | OK |
| manager | Chat | New chat | OK |
| manager | Chat › Block A crew | Chat info | NO HACE NADA |
| manager | Chat › Block A crew | Attach file | NO HACE NADA |
| manager | Chat › Block A crew | Reply | OK |
| manager | Chat › Block A crew | More | NO VISIBLE |
| manager | Chat › Block A crew | Record voice message | OK |
| manager | Chat › Block A crew | Quick replies | OK |

## Los 16 flujos entre roles

| # | Flujo | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Runner registra una cubeta → manager, TL, nómina | **OK** (con detalle) | Ver nota 1 |
| 2 | TL: salida y entrada en el pase de lista → manager, nómina, RRHH | **A MEDIAS** | Ver nota 2 |
| 3 | TL corrige un fichaje → nómina y Audit Log | **A MEDIAS** | Ver nota 3 |
| 4 | Nómina aprueba uno y «Approve all» → TL y manager | **ROTO** | Ver nota 4 |
| 5 | QC inspecciona (rechazo) → manager | **A MEDIAS** | Ver nota 5 |
| 6 | Runner pide transporte → Logística asigna y completa → runner | **A MEDIAS** | Ver nota 6 |
| 7 | Broadcast del manager → TL, runner, QC | **A MEDIAS / ROTO para QC** | Ver nota 7 |
| 8 | Chat «Block A crew» manager ↔ TL | **OK** | Ver nota 8 |
| 9 | RRHH: ausencia aprobada hoy → RRHH, TL, manager | **A MEDIAS** | Ver nota 9 |
| 10 | RRHH cambia la tarifa del contrato → nómina | **OK en el cálculo, A MEDIAS en pantalla** | Ver nota 10 |
| 11 | Manager cambia el precio por cubeta y el de una variedad → TL, nómina, runner | **A MEDIAS** (y con efectos indeseados) | Ver nota 11 |
| 12 | Manager asigna una fila a un equipo → TL | **OK** | Ver nota 12 |
| 13 | Admin desactiva un usuario → no puede entrar; RRHH lo ve | **ROTO** | Ver nota 13 |
| 14 | Logística cambia el estado de un bin → runner | **ROTO (no existe en la interfaz)** | Ver nota 14 |
| 15 | El TL cambia su nombre → manager en Teams | **A MEDIAS** | Ver nota 15 |
| 16 | Manager cierra el día → ¿se puede seguir registrando? | **A MEDIAS** | Ver nota 16 |

**Nota 1 (cubeta).**

- El escáner no tiene cámara en headless, así que pasa solo a la entrada manual.
- El modo lote está activo por defecto: hay que pulsar «Complete Batch» después de «Submit Code». Si no, no
  se guarda nada y no hay ninguna pista de por qué.
- Se guarda: `POST /functions/v1/record-bucket 200`. En BD, Emma Harris pasa de 41 a 42 cubetas en 50 ms.
- El servidor la marca en `rejected_scans` como `flagged` con `PHONE_CLOCK_OFF: phone clock 1139 min behind`.
  La detección funciona.
- El manager y el TL ven el 42 sin recargar en menos de 1 s.
- El total del manager bajó un momento de 792 a 783 y al recargar marca 793.
- Nómina lo ve (158 cubetas, $1,027).
- La cubeta se guarda con `row_number=6`, la fila del equipo.
- Capturas: `f1-scanner`, `f1-manager`, `f1-tl`, `f1-payroll`.

**Nota 2 (salida y entrada).**

- El TL pulsa «Check out Rua Hall» y luego «Check in»: `manage-attendance 200` ×2. En BD se cierra el turno
  y se abre otro.
- Nómina › Timesheets no cambia en vivo. Al recargar marca «25.1 HRS 07:08 AM → 08:45 AM» (la hora de salida
  es la del servidor; ver el aviso del reloj).
- Teams del manager no muestra ningún estado de presencia, ni en vivo ni recargando.
- RRHH no muestra la presencia en ningún sitio.
- Los descansos solo se anotan en Timesheet (flujo 3).
- Capturas: `f2-*`.

**Nota 3 (corrección de fichaje).**

- El TL edita a Rawiri: entrada 07:00, salida 13:00, descanso 10:00 y motivo. `manage-attendance 200`.
- En BD: `corrected_at`, `corrected_by` = Hana, `hours_worked` 5,50 y el motivo guardado.
- `audit_logs` recoge UPDATE y CUSTOM sobre `daily_attendance`, y el admin lo ve en Audit Log.
- Nómina ve las 5,5 h **solo al recargar**.
- El timesheet ya estaba aprobado y sigue «VERIFIED» después de la corrección (fallo 4).

**Nota 4 (aprobación).**

- Aprobar uno funciona: `approve-timesheet 200`, se guardan `verified_at` y `verified_by`, y sale el toast
  «Timesheet approved for …».
- «Approve all» siempre da 400 (fallo 2).
- Ni el TL (columna Status = «present») ni el manager ven en ningún sitio que el timesheet está aprobado.
- También se puede aprobar un turno abierto de 0,0 h.

**Nota 5 (QC).**

- `POST qc_inspections 201` con grade `reject` y los criterios marcados.
- QC no recibe ningún toast.
- El manager no recibe aviso: la campana sigue igual.
- Al abrir el cajón de Emma Harris sale «Low Quality — Quality score 5/100 (7 rejects)». Llega, pero solo si
  se va a mirar.

**Nota 6 (transporte).**

- «REQUEST REFILL» del runner: `POST transport_requests 201` con zona «Row 3».
- Logística lo ve en vivo, unos 2,5 s después (contador «Requests 3 → 4» y nueva tarjeta).
- «Assign Vehicle»: un select con 4 vehículos y luego «Confirm». `PATCH 200`, en BD `assigned` con
  `assigned_vehicle` y `assigned_by`. Deja asignar una carretilla elevadora.
- «Mark Completed»: `PATCH 200`, en BD `completed` con `completed_at`.
- En Almacén, el runner solo ve «Use the button below to request a pickup»: nada sobre el estado de su
  petición.

**Nota 7 (broadcast).**

- `POST broadcasts 201` con `target_roles={team_leader,runner}`.
- El TL y el runner lo ven al abrir la campana, pero el contador no sube.
- QC no lo ve ni recargando.

**Nota 8 (chat).**

- `POST chat_messages 201` del manager. El TL lo ve sin recargar en menos de 1 s.
- La respuesta del TL llega al manager también en menos de 1 s.

**Nota 9 (ausencia).**

- RRHH › Calendar › «New leave»: busco a «Anika», tipo anual, 22-oct, y marco «registrar aprobada».
  `POST leave_requests 201` con `status=approved`.
- Sin toast.
- RRHH › Employees enseña «On leave».
- En el pase de lista del TL Anika sigue «In: 07:09 · Check Out», sin ninguna marca de ausencia, ni recargando.
- En Teams del manager, igual: nada.

**Nota 10 (contrato).**

- RRHH › Contracts: cambio la tarifa de Rua Hall en línea de 23,95 a 35. `PATCH contracts 200` y
  `calculate-payroll 200`.
- En BD queda `hourly_rate=35.00`.
- `calculate-payroll` usa el contrato: `minimum_required` 1745,1 sobre 49,86 h, es decir 35 $/h.
- El panel de nómina no enseña a Rua Hall (solo los 12 primeros) y no hay ningún aviso en pantalla.
- La creación, renovación y finalización de contratos funcionan (`POST/PATCH contracts`).

**Nota 11 (precios).**

- Ajustes › «Save Changes»: `POST harvest_settings 200` con `piece_rate=7.25`.
- Variedad Braeburn: `POST variety_rates 201` (8,10).
- Al recargar Ajustes conserva el 7,25.
- El TL lo ve **al recargar**: «PAY EST.» pasa de $2,246 a $2,697 y el mapa enseña «PIECE RATE $7.25».
- Nómina recalcula toda la semana hacia atrás (fallo 9).
- El runner no enseña ningún precio.
- Efecto indeseado: además escribe `variety='Cherry'` (fallo 8).

**Nota 12 (fila).**

- Orchard Map › Block B › «View Rows» › R27 abre un modal con las filas 16–27, el TL, el runner, el lado y
  «Confirm Assignment».
- Se guarda: `POST row_assignments 201`, `PATCH pickers 204`, `PATCH row_assignments 204`.
- El TL lo ve sin recargar en su mapa: «Row 27 · now 09:16–». La hora es la del servidor.
- La lista «Active Rows» del TL enseña todas las filas del huerto, no solo las de su equipo.

**Nota 13 (desactivar).** Ver el fallo 1. Lo reactivé después desde la misma pantalla (`manage-admin 200`,
`is_active=true`).

**Nota 14 (bins).**

- No hay ningún control para cambiar el estado de un bin en Logística.
- El runner sí lo cambia: al escanear un bin lo pasa a «en uso», y un código nuevo lo da de alta
  (`POST bins 201`; el barrido creó el bin «AUDIT TEST»).

**Nota 15 (nombre).**

- «My account»: cambio el nombre a «Hana Parata-Audit». `POST rpc/update_my_profile 200` y se guarda en BD.
- Sin toast.
- El manager lo ve solo al recargar.
- Lo dejé otra vez en «Hana Parata».

**Nota 16 (cierre del día).**

- «End & Lock Day» abre un modal de confirmación; al confirmar: `calculate-payroll 200` y
  `POST day_closures 201` (closed, 821 cubetas, $8,242.15).
- El `POST audit_logs` da 400 (fallo 6).
- **Cubetas: se bloquean bien.** `record-bucket 200` con
  `{"status":"rejected","reason":"INSERT_BLOCKED: Day 2026-10-22 is closed…"}`. La BD no cambia (346 → 346)
  y el runner ve «1 scan not accepted», aunque a la vez sale «Bucket saved…».
- **Correcciones de fichaje: no se bloquean** (fallo 5).
- **Entradas nuevas:** el servidor las fecha el 23-oct (desfase de reloj), así que no pude comprobar si la
  fecha del día cerrado las rechazaría. No hay trigger de día cerrado en `daily_attendance`.

## Botones destructivos que pulsé (el coordinador restaura la base)

Durante el barrido automático (antes de proteger la lista, o porque no parecían destructivos):

- **Logística › Requests › «Cancel request»** ×2 (primera prueba): cancelaron 2 peticiones de transporte.
- **TL › Roll Call**, en dos pasadas:
  - «Check out» de Sofia Brown y Nikau Wilson. Quedaron turnos de 25 h por el reloj del servidor.
  - Después, «Check in» / «Check out» de los 6 miembros del equipo.
- **TL › Map › «ASSIGN»**: reasignó la fila del equipo de Hana varias veces, y `current_row` de los pickers
  quedó en 6 y luego en 27.
- **Nómina › Timesheets**:
  - «APPROVE» de Rawiri Thomas y Liam Smith.
  - «REJECT» de Lily Young y Sofia Brown.
  - «Approve all» (falló, sin efecto).
- **RRHH › Contracts**:
  - «Create contract» para Alex Morgan (admin) y David Chen (payroll).
  - «Confirm renewal» de Aroha Walker, hasta el 22-10-2027.
- **Runner**:
  - «REQUEST REFILL» y «REQUEST TRANSPORT» (varias peticiones nuevas).
  - «SCAN BIN» con el código «AUDIT TEST» (alta de un bin nuevo).
- **Manager**:
  - «Broadcast» ×3, con el título «Audit test».
  - Ajustes: idioma cambiado a Español y Te Reo Māori, y vuelta al inglés.
  - Ajustes: interruptores de cumplimiento.

A propósito, en los flujos y en el pase destructivo:

- Cubetas manuales: LOC-009 guardada; LOC-012 y LOC-011 rechazadas por el día cerrado.
- Salida y entrada de Rua Hall.
- Corrección de Rawiri Thomas y Tane Williams (×2).
- Intento de corrección del runner sobre Emma Harris (403).
- Aprobación de Emma Harris.
- 3 inspecciones QC con rechazo (Emma Harris).
- Petición de transporte: asignada a Forklift y completada.
- 1 petición cancelada.
- 2 broadcasts «Audit broadcast …».
- 2 mensajes de chat.
- Ausencia anual aprobada para Anika Robinson el 22-oct.
- Tarifa del contrato de Rua Hall a $35/h.
- **Contrato de Alex Morgan terminado.**
- **Precio por cubeta a $7,25, Braeburn a $8,10 y `harvest_settings.variety='Cherry'`.**
- Fila 27 asignada al equipo de Hana.
- **`qc@` desactivado y reactivado.**
- **Runner Wiremu Heke (`runner1@`) desvinculado del huerto: `users.orchard_id=NULL`.**
- Picker nuevo «Audit Picker» (LOC-901) en el equipo de Hana.
- Nombre del TL cambiado y vuelto a poner.
- Entrada en el historial de exportaciones borrada (solo `localStorage`).
- 4 descargas CSV/HTML de nómina.
- **Día 2026-10-22 cerrado (`day_closures`).**

Pulsados sin efecto:

- «Reset Today's Data» (no tiene manejador).
- «Approve all» (400).

No pulsados:

- «Sign out».
- «Clear All» del historial de nómina (no salía en el contexto de prueba).
- «Delete» de documentos de RRHH.
- «Unlink» de los TL.
- «Deactivate» de cualquier otro usuario.
