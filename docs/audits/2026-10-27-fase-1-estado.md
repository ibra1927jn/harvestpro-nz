# Fase 1: estado de la auditoría del 23 de octubre — 2026-10-27

**Qué es esto:** la Fase 1 de `docs/PLAN_NIVEL.md`. Se ha vuelto a mirar, punto por punto, la
auditoría de botones y flujos del 23 de octubre (`docs/audits/2026-10-23-wiring-audit.md`) sobre la
rama `integracion/fase-0` (PR #90), que es lo que `main` va a ser cuando se fusione.

**Cómo se ha mirado:** solo el **código** de esta rama: migraciones de la base, reglas de acceso
(RLS), Edge Functions, servicios, pantallas y sus tests. No había Supabase ni Docker en esta máquina,
así que **no se ha abierto la app real**. Para comprobar algunos puntos se han ejecutado unos pocos
tests sueltos (no la suite entera), y pasaron todos:

- `DayClosedBanner`, `team-leader-smoke`, `fleetBins`, `InvitationsPanel` (30 tests).
- `AttendanceView.offline`, `useRunnerData`, `SettingsView`, `ManagerSetupWizard` (46 tests).
- `invitationLogic`, `pay.behaviour` (58 tests).

Los tests de seguridad de la base (`supabase/tests/security/*.sql`) y los de las Edge Functions
(`supabase/functions/tests/`) necesitan un Supabase de verdad: aquí se citan como prueba porque
existen y la CI del PR #90 los ejecuta, pero no se han ejecutado en esta máquina.

## Cómo leer la tabla

- **ARREGLADO**: el código lo arregla y hay un test que lo demuestra (o la pieza rota ya no existe).
- **EN VIVO**: el código está hecho, pero solo se puede confirmar abriendo la app con dos roles a la
  vez (cosas "en vivo", avisos push, colores). La última columna dice qué pulsar.
- **FALTA**: no está hecho, o solo a medias.

Los "flujos" (F1…F16) son los 16 flujos entre roles de `docs/audits/2026-10-23-wiring/live-app-audit.md`.

## Resumen

| Estado | Puntos |
|---|---|
| ARREGLADO | 38 |
| EN VIVO (hecho en código, falta verlo en la app) | 9 |
| FALTA | 2 |
| **Total** | **49** |

Toda la sección A (seguridad y dinero) y toda la B (botones rotos) están arregladas en el código.
Lo que queda es sobre todo **comprobar en la app real** que los avisos entre roles llegan, más dos
huecos pequeños de comunicación.

## La tabla

| # | Qué fallaba (23-10) | Estado | Prueba en el código | Qué mirar en vivo |
|---|---|---|---|---|
| A1 | Un usuario desactivado seguía entrando y leyendo datos | ARREGLADO | Migración `20261023010000_deactivated_users_locked_out` (sin huerto si está de baja; ban en Auth y sesiones borradas con un trigger, valga la vía que valga). Test `supabase/tests/security/91_deactivated_lockout.sql` | F13: Admin › Usuarios › desactivar a `qc@`; con `qc@` ya abierto en otra ventana, recargar: no ve pickers ni chat y no puede volver a entrar |
| A2 | El team leader corregía fichajes de otros equipos | ARREGLADO | Migración `20261023011000_attendance_team_scope` (borra `attendance_update_policy`, regla por equipo). `supabase/functions/_shared/attendance-access.ts` (`assertCanTouchPicker`, usado en `manage-attendance/index.ts` l. 262, 377, 453). Tests `92_attendance_team_scope.sql`, `supabase/functions/tests/attendance_test.ts`, `_shared/attendance_access_test.ts` | — |
| A3 | Una hoja aprobada se corregía y seguía aprobada; se aprobaban turnos abiertos | ARREGLADO | Migración `20261023012000_timesheet_approval_reset` (corregir quita la aprobación; `review_timesheet` rechaza `SHIFT_OPEN`, l. 90). `approve-timesheet` pasa por `review_timesheet`. Test `93_timesheet_approval_reset.sql` | — |
| A4 | Cambiar el precio recalculaba la semana entera hacia atrás | ARREGLADO | Tabla `piece_rates` (migración `20261023020000_piece_rates_by_day`): precio por día, huerto y variedad. `pieceRateOn()` en `src/services/harvestMetrics/pay.ts` l. 1020 (copia igual en `supabase/functions/_shared/pay-rules.ts`). Tests `96_piece_rates.sql`, `pay.test.ts`, `pay.behaviour.test.ts`, `payroll.differential.test.ts` | F11: Manager › Ajustes › cambiar el precio de hoy; en Nómina, los días anteriores no cambian |
| A5 | Reglas de acceso demasiado anchas (cambiarse de huerto, tarifas, transporte a nombre de otro, fichajes de todo el huerto) | ARREGLADO | `20261023013000_access_rules_orchard_transport` (solo oficina cambia su huerto; transporte solo a tu nombre). `20261023020000` l. 213-229 (`variety_rates` por huerto). `20261024021000_attendance_privacy_presence` (runner, QC y logística ya no leen fichajes; usan `presence_today`). Tests `94_access_rules.sql`, `96_piece_rates.sql`, `99_attendance_privacy.sql` | — |
| B1 | No se podía invitar a nadie desde la app | ARREGLADO | `src/components/common/invitations/InvitationsPanel.tsx`, en Admin (`AdminUsersTab.tsx` l. 45) y RRHH (`EmployeesTab.tsx` l. 104). Migración `20261023040000_invitations`. Tests `InvitationsPanel.test.tsx`, `invitationLogic.test.ts`, `97_invitations.sql` | — |
| B2 | «Cerrar el día» fallaba al guardar el registro y nadie se enteraba | ARREGLADO | `DayClosureButton.tsx` (lee `day_closures` al cargar, l. 115; auditoría por `submit-audit-log`, l. 167). Aviso al TL y al runner: `DayClosedBanner.tsx` en `TeamLeader.tsx` y `Runner.tsx`, en vivo por `storeSync.ts` l. 560. Tests `DayClosureButton.test.tsx`, `storeSync.dayClosure.test.ts`, `DayClosedBanner.test.tsx` | F16: el manager cierra el día; el TL y el runner, abiertos a la vez, ven «Día cerrado» sin recargar |
| B3 | Un día cerrado no bloqueaba las correcciones de fichajes | ARREGLADO | Migración `20261023014000_closed_day_attendance_lock`. `manage-attendance` escribe con la sesión del usuario, así que el bloqueo le aplica. Test `96_closed_day_attendance.sql` | — |
| B4 | El asistente de inicio del manager acababa en error | ARREGLADO | `src/components/manager/ManagerSetupWizard.tsx` (el manager configura su huerto, no lo crea). Tests `ManagerSetupWizard.test.tsx`, `OnboardingWizard.test.tsx` | — |
| B5 | Ajustes del manager: «Cherry» por defecto, selector de huerto roto, interruptores muertos, «Reset» sin acción | ARREGLADO | Commit `a0baf45d` (`SettingsView.tsx`, `SettingsFields.tsx`); ya no hay `'Cherry'` en el código. Test `SettingsView.test.tsx` | — |
| B6 | Logística › Flota y Bins: no se guardaba nada | ARREGLADO | `LogisticsWorkspace.tsx` l. 65 (`onUpdateTractor` conectado), `FleetTab.tsx`, `BinsTab.tsx`; migración `20261023044000_fleet_bins_logistics`. Tests `fleetBins.test.tsx`, `98_fleet_bins.sql` | — |
| B7 | El runner veía las horas y el pago de todo el huerto | ARREGLADO | `src/components/views/runner/MyTimesheetView.tsx` («Mis horas», en `Runner.tsx` l. 120); además la RLS de A5 | — |
| B8 | Un enlace del TL llevaba a una pantalla en blanco | ARREGLADO | `team-leader/HomeView.tsx` l. 16 (abre «Mi cuenta»). Test `team-leader-smoke.test.tsx` l. 158 | — |
| B9 | Ficha de picker del TL: guardar fallaba en silencio, «Enviar mensaje» no enviaba | ARREGLADO | El modal viejo ya no existe; el TL usa el mismo cajón que el manager (`PickerDrawer` en `TeamLeader.tsx` l. 114). Test `team-leader-smoke.test.tsx` l. 200 | — |
| B10 | Nómina rechazaba sin motivo; toast de error con icono de éxito | ARREGLADO | `review_timesheet` exige motivo de 3 a 200 letras (`20261023012000` l. 95); `TimesheetsTab.tsx` l. 41, 84 y 123 (toast de error). Test `93_timesheet_approval_reset.sql` | — |
| C1 | Runner escanea → manager, TL, nómina | ARREGLADO | Ya iba bien el 23 (F1) | — |
| C2 | Chat manager ↔ TL | ARREGLADO | Ya iba bien el 23 (F8); ahora además canal privado por conversación (`20261023070000`) | — |
| C3 | Manager asigna fila → TL (el TL veía todas las filas) | ARREGLADO | `team-leader/TasksView.tsx` l. 40 (`selectTeamRowAssignments`: solo su equipo) | — |
| C4 | Pase de lista del TL → nómina, RRHH, manager | FALTA (a medias) | Manager: presencia por persona en Teams (`PresenceBadge`, `services/presence.ts`). Nómina: se refresca sola (`useAttendanceLiveRefresh`, `TimesheetsTab.tsx` l. 60). **RRHH: ninguna pantalla enseña quién está fichado hoy** | — |
| C5 | Nómina aprueba / rechaza → TL y manager | EN VIVO | Estado «aprobada / rechazada: motivo» en cada fila (`TimesheetRow.tsx`, `timesheet-utils.ts`, commit `edd28059`), y aviso push al TL al rechazar (trigger `trg_push_timesheet_rejected`). **Ojo:** el Timesheet del TL y del manager (`TimesheetEditor.tsx` l. 100) solo carga al abrirlo; no se refresca solo | F4: Nómina rechaza una hoja con motivo; el TL abre Timesheet y ve «rechazada: motivo». Mirar si hay que salir y volver a entrar para verlo |
| C6 | QC inspecciona → TL y manager | EN VIVO | `useQcAlerts.ts`, `NotificationPanel.tsx`, `TeamQualityTodayCard.tsx` en el inicio del TL; push con `trg_push_qc_inspection`. Test `TeamQualityTodayCard.test.tsx` | F5: QC rechaza una cubeta de un picker; el TL ve el aviso y la tarjeta de calidad de hoy; el manager ve la campana con el aviso |
| C7 | Runner pide transporte → logística → runner | EN VIVO | «Mis solicitudes» del runner en vivo (`useRunnerWarehouse.ts`, realtime de `transport_requests`); push al asignar o completar (`trg_push_transport_status`) | F6: el runner pide transporte; Logística lo asigna y luego lo completa; el runner ve cada cambio sin recargar |
| C8 | Aviso del manager (broadcast): no llegaba a QC, la campana no contaba | EN VIVO | Elegir destinatarios, por defecto todos (`BroadcastAudiencePicker.tsx`, `services/broadcastAudience.ts`); la campana cuenta (`useNotificationBadge.ts`); QC tiene chat (`QualityControl.tsx` l. 108) | F7: el manager envía un aviso a «todos»; entrar como QC: lo ve y la campana sube |
| C9 | Ausencia aprobada por RRHH → TL, manager, nómina | ARREGLADO | Commit `42db7d6e`: «de permiso» en el pase de lista, en Teams y en nómina; el TL puede pedir ausencias. Tests `AttendanceView.leave.test.tsx`, `TimesheetsTab.leave.test.tsx`, `95_leave_requests.sql`, `97_leave_team_scope.sql` | F9 (opcional) |
| C10 | Panel de nómina solo enseñaba 12 de 24 personas | ARREGLADO | Commit `36ceb616` (`PayrollDashboard.tsx`: enseña a todos). Test `PayrollDashboard.test.tsx` | — |
| C11 | Manager cambia precios → TL y runner solo al recargar | EN VIVO | Realtime de `piece_rates` y `harvest_settings` (`storeSync.ts`; migración `20261023030100_harvest_settings_realtime`) | F11: el manager cambia el precio de hoy; el inicio del TL y el del runner, abiertos, enseñan el precio nuevo sin recargar |
| C12 | Cambio de nombre → los demás solo al recargar | FALTA (menor) | No se ha tocado. La auditoría lo daba por aceptable | — |
| C13 | Logística cambia un bin → runner (no existía) | EN VIVO | Logística cambia el estado del bin (`BinsTab.tsx`); el runner lo escucha en vivo (`storeSync.ts`, tabla `bins`; `20261023044000`). Test `fleetBins.test.tsx` | F14: Logística pone un bin en «lleno»; el runner lo ve cambiar en su lista sin recargar |
| C14 | Notificaciones push: no existían | EN VIVO | Bandeja `notification_outbox` con triggers (`20261023060000_push_notifications_outbox`), `send-push` (`supabase/functions/send-push/index.ts`), alta del móvil desde el interruptor de Notificaciones, `public/sw-push.js`. Tests `send_push_test.ts`, `_shared/push-outbox.test.ts`, `98_push_outbox.sql`. Necesita claves VAPID y la configuración de `docs/push-notifications.md` | Activar Notificaciones en «Mi cuenta» del TL desde un móvil, cerrar la app, y que QC rechace una cubeta de su equipo: tiene que llegar el aviso con la app cerrada |
| D1 | Pase de lista del TL sin red | ARREGLADO | Cola `ATTENDANCE` por `rollCall.service.ts` y `sync-processors/attendance.processor.ts` (siempre vía `manage-attendance`). Tests `AttendanceView.offline.test.tsx`, `supabase/functions/tests/attendance_offline_test.ts` | Modo avión, fichar entrada de alguien, quitar el modo avión: el fichaje aparece |
| D2 | Bins del runner sin red | ARREGLADO | Cola `BIN` (`bin.service.ts`, `sync-processors/bin.processor.ts`, commit `0e23565a`) | — |
| D3 | Foto de QC sin red se perdía | ARREGLADO | `pending_files` cifrados (`services/pending-uploads.service.ts`), salen con la cola `QC_INSPECTION` (`qc-inspection.processor.ts`, commit `94982039`) | — |
| E1 | Chat: adjuntar, info del chat y nota de voz no hacían nada | ARREGLADO | `ChatAttachmentView.tsx`, `ChatInfoPanel.tsx`, nota de voz en `ChatWindow.tsx` l. 76; migración `20261023050000`. Test `98_chat_attachments.sql` | Grabar una nota de voz en el móvil (necesita micrófono) |
| E2 | RRHH › Empleados: la fila no abría nada | ARREGLADO | `hhrr/EmployeeDrawer.tsx`. Test `EmployeeDrawer.test.tsx` | — |
| E3 | Anomalías: «descartadas» era una lista fija | ARREGLADO | Tabla `anomaly_dismissals` (`20261023045000`), `AnomalyDetectionView.tsx` l. 28, `anomaly/SmartDismissals.tsx`. Test `99_dismissals_exports.sql` | — |
| E4 | Informe semanal: «Generate PDF» no generaba nada | ARREGLADO | `src/utils/weeklyReportExport.ts` (imprime desde un iframe), `WeeklyReportView.tsx` l. 196 | Pulsar «Generate PDF» y ver que sale el PDF |
| E5 | «Link Staff» decía «0 staff» | ARREGLADO | `TeamLeaderSelectionModal.tsx` (carga real con aviso de error y reintento), commit `7f797bfc` | — |
| E6 | Runner: la nota de calidad era siempre «A» | ARREGLADO (se quitó) | El modal que nunca salía se borró; calificar es cosa de QC (commit `7f797bfc`) | — |
| E7 | Alta de picker: «hora de inicio» y «fila» no se guardaban | ARREGLADO (se quitó) | Los dos campos se quitaron de `AddPickerModal.tsx` | — |
| E8 | Nómina › Historial de exportaciones en el navegador; «Delete» sin preguntar | ARREGLADO | Tabla `payroll_exports` (`20261023046000`), `ExportHistoryTab.tsx`, `payroll-exports.repository.ts`; borrar pregunta antes. Test `99_dismissals_exports.sql` | — |
| E9 | Logística: «Cancel request» sin confirmar | ARREGLADO | `logistics/RequestsTab.tsx` l. 90 (`window.confirm`) | — |
| F1 | El panel de notificaciones quedaba debajo de las tarjetas | EN VIVO | Commit `e956e82f` (`DesktopLayout.tsx`) | Manager en el PC: abrir la campana; el panel queda por encima de las tarjetas |
| F2 | En modo oscuro no se leían títulos de Ajustes | EN VIVO | Commit `e956e82f` (`src/index.css`) | Modo oscuro › Manager › Ajustes: se leen todos los títulos |
| F3 | Muchos guardados sin confirmación | ARREGLADO | Commit `d07bc0fb`: toast en ausencia, contrato, nombre, asignar fila, fichaje, alta de picker e inspección de QC | — |
| F4 | Mensajes contradictorios tras cerrar el día | ARREGLADO | `useRunnerData.ts` l. 260: con el día cerrado dice «El día está cerrado» y no guarda. Test `useRunnerData.test.ts` | — |
| F5 | Turnos de más de 24 h se pagaban sin tope | ARREGLADO | Migración `20261024020000_clock_skew_and_long_shifts`: más de 14 h sin corregir se pagan 14 h y no se aprueban (`trg_require_long_shift_correction`, `PAY_RULES.maxUnreviewedShiftHours`). Tests de nómina del commit `0659ab60` | — |
| G1 | Tablas bien conectadas | ARREGLADO | Siguen igual; `leave_requests` ya la usan también TL, manager y nómina (C9) | — |
| G2 | Tablas que solo se llenaban con seeds (temporadas, bloques, filas, flota, invitaciones) | ARREGLADO | Pantallas de estructura del huerto (`components/views/orchard-structure/`, migraciones `20261024010000` y `20261024011000`), flota (B6), invitaciones (B1). Tests `99_orchard_structure.sql`, `e2e/fresh-company.spec.ts` | — |
| G3 | Tablas muertas | ARREGLADO | Borradas en `20261024030000_drop_dead_tables` (`messages`, `quality_inspections`, `wage_rates`, `sync_conflicts`, `login_attempts`, `account_locks`, vista `pickers_performance_today`); `push_subscriptions` ya se usa (C14). Queda `variety_rates`, marcada como obsoleta | — |

## Lo que falta de verdad (por orden de prioridad)

Esta lista es la que guía las fases 2 a 5.

1. **Barrido en vivo de la seguridad (Fase 2).** Todo A está arreglado en el código y con tests de la
   base, pero ninguno se ha visto en la app real tras juntar las ramas. Lo primero: A1 con la sesión
   abierta (el token viejo vale hasta 1 hora: comprobar que tampoco lee el chat, que no pasa por el
   huerto), A2 con un TL corrigiendo a alguien de otro equipo, y A5 con un runner intentando leer
   fichajes. Además, lo que pide la Fase 2 y esta revisión no ha hecho: buscar migraciones con
   `USING (true)` que ninguna posterior cierre.
2. **Los 9 puntos EN VIVO (Fase 3).** Los avisos entre roles (C5, C6, C7, C8, C11, C13) están
   programados, pero que llegan solo se sabe con dos sesiones abiertas. Es el barrido de «los 16
   flujos» que pide la Fase 3; la columna «Qué mirar en vivo» dice qué pulsar en cada uno.
3. **Push con la app cerrada (C14).** Es lo que más puede fallar sin que se note: depende de las
   claves VAPID, de la configuración de Vault y de que cada móvil active las notificaciones.
   Nunca se ha probado de punta a punta.
4. **El Timesheet del TL y del manager no se refresca solo (C5).** Enseña «aprobada / rechazada»,
   pero solo al abrir la pantalla. Nómina ya se refresca sola; el TL y el manager deberían hacer lo
   mismo (`useAttendanceLiveRefresh`).
5. **RRHH no ve quién está fichado hoy (C4).** El manager sí (Teams). Falta decidir con Ibra si RRHH
   lo necesita y, si sí, poner la presencia en su pantalla de empleados.
6. **Pequeños restos del código** (Fase 5, limpieza):
   - Un escaneo hecho sin red en un día ya cerrado puede seguir dando dos mensajes (el runner solo
     sabe que el día está cerrado si tenía red cuando se cerró).
   - Al fichar en otro huerto, el turno abierto del huerto anterior se cierra con la clave de
     servicio, que se salta el bloqueo de día cerrado (B3). Caso raro.
   - `variety_rates` sigue en la base aunque ya no se usa.
7. **Cambio de nombre (C12):** los demás lo ven al recargar. La auditoría lo daba por aceptable; lo
   último de la lista.
