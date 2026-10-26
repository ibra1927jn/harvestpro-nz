# Auditoría estática: botones, cableado y tablas por rol — HarvestPro NZ

Rama revisada: `integration/2026-10-22` (worktree `/home/claude/wt/integration`, HEAD `58b942ed`). Solo lectura: código, `git` y catálogo de la base local (`pg_policies`, `information_schema`, `pg_proc`, `pg_trigger`, `storage.buckets`). No se ha tocado la app ni la base.

## 1. Resumen

**Respuesta corta al dueño:** casi todos los botones hacen algo de verdad y van a la tabla correcta. 403 de 456 controles distintos están bien. Pero hay **6 ROTOS, 6 BLOQUEADOS por RLS o trigger, 9 MAQUETA, 2 SIN HANDLER y 2 SIN RED**. Además hay **19 controles de código que la pantalla nunca enseña**. Lo más grave no es un botón. Es **comunicación entre roles que no llega**:
- la nómina rechaza una hoja y el team leader no se entera;
- el QC inspecciona y el team leader no lo ve;
- RRHH registra una ausencia y nadie más la usa;
- no existen las notificaciones push;
- no hay forma de dar de alta (invitar) usuarios desde la app.

También hay una **regresión en `main`**: el commit `0bfab88f` (test(loadsim) del 21-10) devolvió tres Edge Functions a su versión antigua.

### Controles por veredicto

Un «control» es cada `onClick / onChange / onSubmit / onSave / onToggle…` de un componente alcanzable desde la página del rol, siguiendo los imports desde `src/pages/<Rol>.tsx`. Para los controles que solo enseña un rol (por ejemplo, «broadcast» solo para el manager) se ha comprobado a mano.

| Veredicto | Únicos (toda la app) | Qué significa aquí |
|---|---|---|
| OK | 403 | Llega a su destino (o es navegación o estado local legítimo) |
| OK* | 9 | Funciona, pero con un fallo menor anotado (dato fijo, campo que no se guarda, pérdida de la foto sin red…) |
| MAQUETA | 9 | Hace como que funciona: el estado es solo local o enseña «enviado» sin enviar |
| BLOQUEADO POR RLS | 6 | La BD (RLS, trigger o rol de la Edge Function) rechaza lo que intenta ese rol |
| ROTO | 6 | Llama a columnas que no existen, a un modo de Edge Function borrado o a una pestaña que no existe |
| SIN HANDLER | 2 | El control se puede editar, pero no hay función que guarde |
| SIN RED | 2 | CLAUDE.md pide offline-first y el control no se encola |
| INALCANZABLE | 19 | Código con handler que ninguna pantalla enseña (no cuenta como fallo) |

| Rol | Controles alcanzables | OK | OK* | MAQUETA | BLOQUEADO | ROTO | SIN HANDLER | SIN RED | INALC. |
|---|---|---|---|---|---|---|---|---|---|
| manager | 264 | 237 | 3 | 8 | 3 | 4 | 2 | 0 | 7 |
| team_leader | 152 | 129 | 3 | 6 | 3 | 2 | 0 | 2 | 7 |
| runner | 118 | 102 | 2 | 5 | 3 | 1 | 0 | 0 | 5 |
| qc_inspector | 79 | 76 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| admin | 73 | 70 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| hr_admin | 138 | 135 | 2 | 0 | 0 | 1 | 0 | 0 | 0 |
| logistics | 78 | 74 | 1 | 0 | 0 | 1 | 2 | 0 | 0 |
| payroll_admin | 77 | 71 | 4 | 0 | 0 | 2 | 0 | 0 | 0 |

(Los comunes —cabecera, Mi cuenta, consentimiento de privacidad, MFA— cuentan en cada rol. El ROTO que comparten todos es `PrivacyConsentModal.tsx:86`.)

### Los 15 problemas más graves

1. **«Aprobar todas» en Nómina falla siempre.** `src/components/views/payroll/TimesheetsTab.tsx:115` → `payroll.service.ts:203-215` manda `{items:[…]}`. Pero `supabase/functions/approve-timesheet/index.ts:34` solo parsea `TimesheetApprovalSchema` (`attendance_id` obligatorio), así que la respuesta es 400 y todas las hojas salen «failed». El modo lote existía: lo borró el commit `0bfab88f` («test(loadsim): week scenario…»), que también quitó `TimesheetBatchApprovalSchema` de `_shared/security.ts`. Ese commit además:
   - quitó la **paginación de `detect-anomalies`** (`detect-anomalies/index.ts`: `.select(...)` sin `fetchAllRows`, así que con más de 1000 cubetas al día solo se analizan 1000; incumple la regla de CLAUDE.md);
   - quitó los reintentos por interbloqueo y el upsert en bloque de `record-bucket`;
   - quitó la caché de `nzDateOf` de `pay-rules.ts`.

   **Debería:** recuperar la versión de `0f1db627` de esas 4 rutas (`git show 0f1db627:supabase/functions/...`).
2. **No se puede dar de alta a nadie desde la app.** El registro exige una fila en `allowed_registrations` (trigger `guard_user_changes`: «No invitation for this email»). Pero **ninguna pantalla la escribe**: la app solo la lee (`repositories/auth-context.repository.ts:105-131`) y ni Admin (`pages/admin/AdminUsersTab.tsx`) ni RRHH tienen «invitar». Hoy solo hay altas con seeds o SQL. **Debería:** RRHH/admin tienen que poder crear invitaciones con email, rol y huerto (la RLS «HR manage allowed registrations» ya lo permite).
3. **El runner ve las horas y el pago de todo el huerto, y sus botones de corregir dan 403.** `src/pages/Runner.tsx:27,34,122` monta el `TimesheetEditor` del manager:
   - `TimesheetEditor.tsx:221` («generate») calcula el pago de todos (RLS «Read attendance» deja leer el huerto entero);
   - `TimesheetRow.tsx:151` → `manage-attendance` `requireRole(['admin','manager','team_leader'])` → 403.

   **Debería:** enseñar solo su hoja (lo arregla #70: `MyTimesheetView`).
4. **No hay notificaciones push.** `services/push.service.ts`, `repositories/push.repository.ts` y `hooks/useNotifications.ts` no los importa nadie (son código muerto, comprobado desde `src/index.tsx`). `push_subscriptions` nunca se escribe y `send-push` nunca se llama. «Notificaciones» en Mi cuenta (`AccountSheet.tsx:351`) y en Ajustes (`SettingsView.tsx:158`) solo activan notificaciones locales mientras la app está abierta (`notification.service.ts:113`, sondeo).
5. **QC → team leader y manager no llega.** El TL no tiene ninguna vista de inspecciones. `stores/storeSync.ts:366-381` llena `recentQcInspections` por realtime y **nadie lo lee** (grep sin consumidores). El manager solo ve QC al abrir el cajón de un picker (`picker-history.repository.ts:73`) o por la alerta local de rechazo >15 %. **Debería:** aviso al TL y al manager por cada inspección con «reject» o con un criterio «mal».
6. **Nómina rechaza una hoja y nadie se entera.**
   - `TimesheetRow.tsx` (TL y manager) no enseña `verified_by`, `rejected_at` ni `rejection_reason`, aunque `attendance.repository.ts:28` los trae (`select('*')`).
   - Además, `TimesheetsTab.tsx:155` rechaza **sin motivo**: `rejectTimesheet(id, updated_at)` no pasa `reason`, así que `rejection_reason` queda null.

   **Debería:** marcar en la hoja del TL «rechazada: motivo» y pedir el motivo al rechazar.
7. **El TL «guarda» el estado de un picker y la BD lo rechaza en silencio.** `modals/picker-details/PickerProfileView.tsx:146`, `RunnerProfileView.tsx:78` y `TeamLeaderProfileView.tsx:136` → `crewSlice.updatePicker` (`stores/slices/crewSlice.ts:140-167`). El trigger `guard_picker_team_changes` lanza `TEAM_LEADER_CANNOT_MOVE_PICKERS` si cambia `status`; el error se traga y el rollback no avisa. El selector incluso ofrece «Inactive» al TL (`PickerProfileView.tsx:135-140`). (#71 quita este modal y pone el cajón del manager.)
8. **«Enviar mensaje» del TL al picker es de mentira.** `QuickMessageView.tsx:30-41` pone «enviado» con `setTimeout`, pero `TeamView.tsx:197-202` no pasa `onSendMessage`, así que no se envía nada. (#71 elimina el modal.)
9. **El cierre del día no queda auditado ni se recuerda.**
   - `DayClosureButton.tsx:167-182` inserta en `audit_logs` `{event_type, metadata}`: columnas que no existen, y falta `action` (NOT NULL, CHECK INSERT/UPDATE/DELETE/CUSTOM). El error no se comprueba.
   - `dayClosed` es solo memoria (`stores/useHarvestStore.ts:62`) y nadie lo carga de `day_closures`. Tras recargar se puede pulsar otra vez: falla por `UNIQUE(orchard_id,date)`.
   - TL y runner no saben que el día está cerrado: sus escaneos los rechaza `enforce_closed_day_bucket_records` y solo se ven como «rechazado».
10. **El asistente de primer arranque del manager termina en error.** `components/manager/OnboardingWizard.tsx:105` (se muestra en `pages/Manager.tsx:277` si no hay marca en localStorage) → `SetupWizard` → `setup_orchard_atomic`, que empieza con `IF NOT is_role(ARRAY['admin']) THEN RAISE 'Only an admin can create orchards'`. **Debería:** no ofrecerse al manager, o ser un asistente de *configurar* su huerto (ajustes, variedades), no de crearlo.
11. **Ajustes del manager:**
   - el selector de huerto (`SettingsView.tsx:129` → `hooks/useSettings.ts:195-220`) solo cambia el store. Al guardar, `harvest_settings` upsert de otro huerto ≠ `get_my_orchard_id()`, y la RLS «Manage settings» lo rechaza («Settings not saved»). El cambio real de huerto es `OrchardSwitcher`.
   - los 3 interruptores de cumplimiento (`SettingsView.tsx:137-139`) son `useState` sin efecto (`useSettings.ts:69-74`).

   **Debería:** quitar el selector o usar `switchOrchard`, y quitar o cablear los interruptores.
12. **La flota no se puede editar.** `views/logistics/LogisticsWorkspace.tsx:75` renderiza `<FleetTab tractors={tractors} />` sin `onUpdateTractor`. El conductor (`FleetTab.tsx:122`) y el estado (`FleetTab.tsx:135`) se editan en pantalla y no se guardan. No hay alta de vehículos ni forma de rellenar `fleet_vehicles.type` (que pide #70). `fleet_vehicles` solo se llena con seeds.
13. **RLS de fichajes más ancha que las reglas:**
   - `daily_attendance` «attendance_update_policy» (`UPDATE … USING is_role(['manager','team_leader'])`) no filtra huerto ni equipo, y se suma (OR) a «Manage attendance».
   - en servidor, el TL no está limitado a su equipo: `manage-attendance/index.ts:46-56` solo comprueba el huerto en el check-in; check-out y correct no comprueban nada más que la RLS.
   - «Read attendance» (`orchard_id = get_my_orchard_id()`) deja a runner, QC, logística y nómina leer los fichajes de todo el huerto.
14. **El pase de lista no funciona sin cobertura.** `hooks/useAttendance.ts:39-63` (`networkMode:'always'`, llamada directa a `manage-attendance`): sin red falla. El procesador `ATTENDANCE` existe (`sync-processors/attendance.processor.ts`), pero nadie encola ese tipo (grep: solo `conflict.service.ts` reencola). Igual pasa con los bins del runner:
   - `useRunnerData.ts:84` (`updateBinStatus`) y `bin.service.ts:62` (`registerBin`) se pierden sin red;
   - logística nunca ve esos bins llenos.
15. **Las ausencias de RRHH no llegan a nadie.** `leave_requests` solo se lee y escribe en RRHH (`services/leave.service.ts`, `CalendarTab`). La nómina (`_shared/payroll-calc.ts`), el pase de lista del TL y el manager no la consultan, aunque la RLS ya deja leer al TL y al manager y pedir ausencias (`Request leave`).

Otros hallazgos (sección 5):
- `HomeView.tsx:57` navega a una pestaña `'profile'` que no existe (pantalla vacía; #71 no lo arregla).
- `QualityRatingModal` es inalcanzable: toda cubeta del runner se guarda con `quality_grade:'A'` (`useRunnerData.ts:277`).
- Huerto nuevo sin temporada, bloques ni filas: ninguna pantalla escribe `harvest_seasons`, `orchard_blocks` ni `block_rows`.
- La lista de «Smart dismissals» de anomalías es fija (`fraud-detection.service.ts:115`).
- `pickers_performance_today` siempre está vacía (`users.role='picker'` no existe).
- `wage_rates.service.ts` usa la columna `effective_from` (no existe) y un `onConflict` sin índice único (código muerto).
- Cualquier rol puede cambiarse de huerto a sí mismo.
- La BD local tiene ya aplicada la migración de #70.

### Notas de método y del entorno
- **La BD local va por delante de esta rama.** `fleet_vehicles.type` y la política «Requester cancels own pending request» existen en la base, pero su migración (`20261022030000_runner_self_service.sql`) solo está en `origin/fix/runner-review`. Lo que diga de RLS está comprobado contra la base real; donde importa lo indico.
- Hay módulos que la app no importa (muertos desde `src/index.tsx`): `APIKeysView`, `DeadLetterQueueView`, `MPIExportView`, `settings/WageRatesPanel`, `DaySettingsModal`, `SecurityDashboard`, `services/{api-keys,mpi-export,data-export,wage-rates,push,authHardening,rest-break-compliance,employment-agreement}.service.ts`, `repositories/{auth,push}.repository.ts`, `hooks/useNotifications.ts`, `services/compliance/attendanceGap.ts`. Por eso sus fallos no cuentan como botones, pero se listan en la matriz:
  - `api_keys` no existe;
  - `mpi-export.service.ts:66,84,203` usa `pickers.full_name`, `orchard_blocks.variety` y `audit_logs.new_data`, que no existen;
  - `login_attempts` y `account_locks` no los escribe nadie.
- La columna «Control» sale de la clave `t()` más cercana al handler. Las claves dudosas están corregidas a mano.

## 2. Inventario de controles por rol

Formato: archivo:línea · texto (clave i18n → inglés de `src/i18n/locales/en/`) · handler · destino (cadena componente → hook/servicio → repositorio → tabla/RPC/Edge/Storage/cola) · veredicto. Los controles que solo navegan o cambian estado local (pestañas, cerrar, filtros, campos antes de guardar) se agrupan en una fila por archivo y son **OK**. Todos los que escriben o leen datos van uno por fila.

### Comunes a los 8 roles (cabecera, Mi cuenta, MFA, consentimiento)

Cabecera: `Header.tsx:93` campana → `NotificationPanel` (avisos de `broadcasts`; «marcar leídos» → rpc `acknowledge_broadcast`, OK). `Header.tsx:120` avatar → `AccountSheet`. `ThemeToggle.tsx:20` estado local. Destinos con datos:

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/MFASetup.tsx:82` | mfa.generating → "Generating..." | `handleGenerateQR` | supabase.auth.mfa.enroll | **OK** |
| `components/MFASetup.tsx:191` | — | `handleVerify` | supabase.auth.mfa.challengeAndVerify | **OK** |
| `components/common/DesktopLayout.tsx:257` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/DesktopLayout.tsx:345` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/account/AccountSecurity.tsx:108` | account.security.change_password → "Change password" | `e => void submitPassword(e)` | accountService.changePassword → auth.signInWithPassword (verificar) + auth.updateUser | **OK** |
| `components/common/account/AccountSheet.tsx:221` | account.photo.change → "Change photo" | `e => void onPickFile(e)` | Storage avatars upload + rpc update_my_profile(p_avatar_url) | **OK** |
| `components/common/account/AccountSheet.tsx:238` | account.photo.remove → "Remove photo" | `() => void onRemovePhoto()` | Storage avatars remove + rpc update_my_profile | **OK** |
| `components/common/account/AccountSheet.tsx:254` | account.details.title → "My details" | `e => void submitDetails(e)` | rpc update_my_profile(p_full_name, p_phone) → trigger sync_person_from_user → pickers.name | **OK** |
| `components/common/account/AccountSheet.tsx:297` | — | `() => void chooseLocale(loc.code)` | rpc update_my_profile(p_preferred_locale) | **OK** |
| `components/common/account/AccountSheet.tsx:351` | — | `v => void toggleNotifications(v)` | notificationService.setEnabled: Notification API local + sondeo (no hay push: push.service no se importa) | **OK*** |
| `components/common/account/AccountSheet.tsx:359` | common.sign_out → "Sign Out" | `() => void handleSignOut()` | signOut | **OK** |
| `components/modals/PrivacyConsentModal.tsx:164` | privacy.acceptButton → "I Have Read and Accept This Privacy Notice" | `handleAccept` | users.update(privacy_consent_at) OK + privacy_consent_log insert OK; pickers.update({privacy_consent_at}).eq("user_id") → columnas inexistentes (error ignorado) | **ROTO** |
| `components/modals/ReAuthModal.tsx:98` | auth.email → "Email" | `handleReAuth` | auth.signInWithPassword | **OK** |

### Por rol (sin los comunes)

### Manager

Controles: 264 — OK 237, MAQUETA 8, INALCANZABLE 7, ROTO 4, BLOQUEADO POR RLS 3, OK* 3, SIN HANDLER 2

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/common/SetupWizard.tsx:174` | botón final del asistente ("Creating..." literal) | `handleSubmit` | para el manager (OnboardingWizard): setup_orchard_atomic → "Only an admin can create orchards" | **BLOQUEADO POR RLS** |
| `components/common/messaging/ChatWindow.tsx:114` | respuesta rápida (emoji + texto) | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert (sin red: messageOutbox) | **OK** |
| `components/common/messaging/ChatWindow.tsx:154` | emoji de reacción (contador "1") | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState, no se guarda ni lo ve nadie más | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:166` | common.retry → "Retry" | `() => onRetry(m.id)` | messageOutbox.retry | **OK** |
| `components/common/messaging/ChatWindow.tsx:174` | chat.reply → "Reply" | `() => setReplyTo(m)` | setReplyTo: handleSend llama onSend(text) sin replyTo; metadata.replyTo nunca se guarda | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:180` | botones de reacción (REACTION_EMOJIS) | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:213` | respuesta rápida | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert | **OK** |
| `components/common/messaging/ChatWindow.tsx:245` | campo de mensaje (chat.type_message) | `(e) => { setNewMessage(e.target.value); if (e.target.value.l` | indicador "escribiendo" solo local (no hay presence realtime) | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:259` | chat.send → "Send message" | `() => handleSend()` | sendMessage → chat_messages insert / outbox | **OK** |
| `components/common/messaging/ChatWindow.tsx:264` | chat.record_voice (icono mic) | `() => setIsRecording(!isRecording)` | micrófono: solo cambia isRecording, no graba ni envía nada | **MAQUETA** |
| `components/common/messaging/NewChatModal.tsx:98` | icono check | `() => { if (mode === 'direct') onStartDirect(p.id); else tog` | getOrCreateConversation → conversations select/insert | **OK** |
| `components/common/messaging/NewChatModal.tsx:120` | chat.create_group_n → "Create Group ({n} members)" | `handleCreateGroup` | createChatGroup → conversations insert | **OK** |
| `components/manager/OnboardingWizard.tsx:105` | "Start Setup" (literal, sin i18n) | `handleStartSetup` | abre SetupWizard → setup_orchard_atomic lanza "Only an admin can create orchards" para el manager | **BLOQUEADO POR RLS** |
| `components/modals/BroadcastModal.tsx:109` | — | `handleSend` | sendBroadcast → broadcasts insert (solo manager) | **OK** |
| `components/modals/ImportCSVModal.tsx:141` | "Close import modal" (literal) | `handleClose` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/ImportCSVModal.tsx:165` | — | `step === 'done' ? handleClose : reset` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/ImportCSVModal.tsx:173` | icono description | `handleImport` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/ImportCSVModal.tsx:183` | "Done" (literal) | `handleClose` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/TeamLeaderSelectionModal.tsx:276` | — | `handleBatchAssign` | userService.assignUserToOrchard → users.orchard_id + pickers insert/update | **OK** |
| `components/modals/import-csv/ImportSteps.tsx:28` | icono upload | `() => fileInputRef.current?.click()` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/import-csv/ImportSteps.tsx:41` | — | `onFileSelect` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/import-csv/ImportSteps.tsx:49` | "Download CSV Template" (literal) | `onDownloadTemplate` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/staff-selection/StaffRow.tsx:65` | — | `(e) => onUnlink(e, person.id)` | userService.unassignUserFromOrchard → users + pickers | **OK** |
| `components/views/logistics/FleetTab.tsx:122` | logi.assign_driver → "Assign driver..." | `(val) => onUpdateTractor?.(tractor.id, { driver_name: val })` | LogisticsWorkspace renderiza <FleetTab tractors> sin onUpdateTractor: el InlineEdit se edita y no guarda nada | **SIN HANDLER** |
| `components/views/logistics/FleetTab.tsx:135` | selector de estado del vehículo (active/idle/maintenance/offline) | `(val) => onUpdateTractor?.(tractor.id, { status: val as Trac` | sin onUpdateTractor: el estado del vehículo no se guarda | **SIN HANDLER** |
| `components/views/logistics/RequestsTab.tsx:191` | logi.confirm → "Confirm" | `() => handleAssign(req.id, req.updated_at)` | assignTransportRequest → cola TRANSPORT assign → transport_requests update (lock optimista) | **OK** |
| `components/views/logistics/RequestsTab.tsx:215` | logi.cancel_request → "Cancel request" | `() => handleCancel(req.id, req.updated_at)` | cola TRANSPORT cancel → transport_requests status=cancelled | **OK** |
| `components/views/logistics/RequestsTab.tsx:230` | logi.mark_completed | `() => handleComplete(req.id, req.updated_at)` | cola TRANSPORT complete → status=completed, completed_at | **OK** |
| `components/views/logistics/RequestsTab.tsx:237` | logi.cancel_request → "Cancel request" | `() => handleCancel(req.id, req.updated_at)` | cola TRANSPORT cancel | **OK** |
| `components/views/manager/AnomalyDetectionView.tsx:113` | "Refresh anomalies" (literal) | `loadAnomalies` | detect-anomalies: el commit 0bfab88f quitó la paginación; con >1000 cubetas/día solo analiza las 1000 primeras | **ROTO** |
| `components/views/manager/BroadcastModal.tsx:106` | broadcast.send → "Send Broadcast" | `handleSend` | sendBroadcast → broadcasts insert | **OK** |
| `components/views/manager/DashboardView.tsx:192` | dashboard.export → "Export" | `handleExport` | CSV local con piece_rate único (no variety_rates); pending_queue_count fijo a 0 | **OK*** |
| `components/views/manager/DayClosureButton.tsx:89` | close.confirm → "Confirm Closure" | `onConfirm` | confirmClosure: day_closures insert OK; audit_logs insert con event_type/metadata (no existen) y sin action NOT NULL → falla, error no comprobado | **ROTO** |
| `components/views/manager/DayClosureButton.tsx:207` | close.title → "End & Lock Day" | `handleClosureClick` | calculate-payroll (resumen del día) | **OK** |
| `components/views/manager/DayClosureButton.tsx:221` | — | `confirmClosure` | ídem (onConfirm del modal) | **ROTO** |
| `components/views/manager/PredictionsCard.tsx:71` | mgr.view_insights → "View Insights & Analytics" | `() => setActiveTab('analytics')` | navegación | **OK** |
| `components/views/manager/RowAssignmentModal.tsx:243` | — | `handleAssign` | assignRows → row_assignments upsert + pickers.current_row | **OK** |
| `components/views/manager/SettingsView.tsx:129` | selector de huerto (settings.orchard.title) | `s.handleOrchardSelect` | handleOrchardSelect cambia solo el store; al guardar, upsert de OTRO huerto ≠ get_my_orchard_id() → RLS lo rechaza | **BLOQUEADO POR RLS** |
| `components/views/manager/SettingsView.tsx:137` | settings.compliance.nz_standards → "NZ Employment Standards" | `(v) => s.setCompliance(prev => ({ ...prev, nz_employment_sta` | setCompliance: estado local, no se guarda ni cambia nada | **MAQUETA** |
| `components/views/manager/SettingsView.tsx:138` | settings.compliance.wage_alerts → "Automatic Wage Alerts" | `(v) => s.setCompliance(prev => ({ ...prev, auto_wage_alerts:` | setCompliance local | **MAQUETA** |
| `components/views/manager/SettingsView.tsx:139` | settings.compliance.safety → "Safety Verification Required" | `(v) => s.setCompliance(prev => ({ ...prev, safety_verificati` | setCompliance local | **MAQUETA** |
| `components/views/manager/SettingsView.tsx:158` | settings.notifications → "Notifications" | `s.handleNotifToggle` | notificaciones locales (sin push) | **OK*** |
| `components/views/manager/SettingsView.tsx:172` | settings.notif.test_sent → "Test Sent" | `s.handleSendTest` | notificación local de prueba | **OK** |
| `components/views/manager/SettingsView.tsx:209` | icono s | `s.handleSave` | settingsService.updateHarvestSettings → harvest_settings upsert | **OK** |
| `components/views/manager/TeamLeaderCard.tsx:125` | desvincular (icono link_off, doble toque) | `(e) => handleUnlink(e, leader.id)` | handleRemoveUser → users.orchard_id=null + pickers archived (offline: cola UNLINK) | **OK** |
| `components/views/manager/TeamLeaderCard.tsx:212` | desvincular miembro | `(e) => handleUnlink(e, member.id)` | ídem (solo miembros que no son picker) | **OK** |
| `components/views/manager/settings/VarietyRatesEditor.tsx:102` | — | `() => save(r.variety)` | variety_rates insert/update/delete | **OK** |
| `components/views/manager/teams/RunnersSection.tsx:110` | desvincular runner | `(e) => handleUnlink(e, runner.id)` | handleRemoveUser (runner) | **OK** |
| `components/views/manager/weekly-report/ExportModal.tsx:117` | icono download | `format === 'pdf' ? onExportPDF : onExportCSV` | PDF/CSV local | **OK** |
| `components/PickerDrawer/PickerDrawer.tsx` (líneas 133, 140) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/PickerDrawer/PickerDrawerParts.tsx` (líneas 116, 121, 126) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/charts/TrendLineChart.tsx` (líneas 161) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/RejectedScansAlert.tsx` (líneas 39) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/SetupWizard.tsx` (líneas 109, 146, 157, 165) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnclosedShiftsAlert.tsx` (líneas 44) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnifiedMessagingView.tsx` (líneas 235, 242) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/ChatWindow.tsx` (líneas 82, 230, 236) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/MessagingSidebar.tsx` (líneas 58, 65, 73, 78, 91, 125, 133) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/NewChatModal.tsx` (líneas 44, 45, 64, 70, 73, 84, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/picker-profile/TabButton.tsx` (líneas 15) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/row-history/RowHistory.tsx` (líneas 61) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/setup-wizard/OrchardStep.tsx` (líneas 15, 25, 36, 49) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/setup-wizard/RatesStep.tsx` (líneas 16, 31, 42) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/manager/OnboardingWizard.tsx` (líneas 112) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/BroadcastModal.tsx` (líneas 48, 59, 69, 86) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/TeamLeaderSelectionModal.tsx` (líneas 165, 178, 185, 204, 217, 224, 257) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/staff-selection/StaffRow.tsx` (líneas 24) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/primitives/ClickableRow.tsx` (líneas 14) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/primitives/EntityId.tsx` (líneas 44) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/FilterBar.tsx` (líneas 95, 115, 125, 171, 176, 190, 197, 222) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineEdit.tsx` (líneas 102, 116) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineSelect.tsx` (líneas 74, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/ModalOverlay.tsx` (líneas 51) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/Toast.tsx` (líneas 48) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/logistics/LogisticsWorkspace.tsx` (líneas 122) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/logistics/RequestsTab.tsx` (líneas 178, 198, 208) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/AnomalyDetectionView.tsx` (líneas 158) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/BroadcastModal.tsx` (líneas 48, 68, 78, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/CostAnalyticsView.tsx` (líneas 146) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/DashboardEmptyState.tsx` (líneas 30, 37) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/DashboardStatCard.tsx` (líneas 28) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/DashboardView.tsx` (líneas 199, 217, 228, 238, 248) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/DayClosureButton.tsx` (líneas 82) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/HeatMapView.tsx` (líneas 216, 277) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/InsightsView.tsx` (líneas 44, 54, 64) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/MapToggleView.tsx` (líneas 60) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/MoreMenuView.tsx` (líneas 40) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/OrchardMapView.tsx` (líneas 68, 95, 106, 117) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/PerformanceFocus.tsx` (líneas 92, 122, 131) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/RowAssignmentModal.tsx` (líneas 116, 117, 128, 164, 208, 227) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/RowGrid.tsx` (líneas 49) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/RowListView.tsx` (líneas 142) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/RowTeamDisplay.tsx` (líneas 51, 79) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/SettingsView.tsx` (líneas 89, 92, 100, 102, 115, 164, 165, 166, 167, 189) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TeamDrawer.tsx` (líneas 67, 76, 99, 109) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TeamLeaderCard.tsx` (líneas 73, 79, 151, 178) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TeamLeadersSidebar.tsx` (líneas 35, 53) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TeamsView.tsx` (líneas 148) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/VelocityChart.tsx` (líneas 188) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/VelocityHourDrilldown.tsx` (líneas 53, 61, 78) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/WageShieldPanel.tsx` (líneas 231) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/WeeklyReportView.tsx` (líneas 92, 141, 179) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/anomaly/AnomalyCard.tsx` (líneas 24) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/anomaly/SmartDismissals.tsx` (líneas 24) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/orchard-map/BlockCard.tsx` (líneas 50) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/orchard-map/RowCard.tsx` (líneas 56) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/settings/SettingsFields.tsx` (líneas 45, 79) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/settings/VarietyRatesEditor.tsx` (líneas 97) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/teams/RunnersSection.tsx` (líneas 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/teams/TeamsToolbar.tsx` (líneas 52, 69, 91) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/weekly-report/DayDetailPanel.tsx` (líneas 28) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/weekly-report/ExportModal.tsx` (líneas 29, 30, 43, 61, 84) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `pages/Manager.tsx` (líneas 263) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### Team leader

Controles: 152 — OK 129, INALCANZABLE 7, MAQUETA 6, OK* 3, BLOQUEADO POR RLS 3, ROTO 2, SIN RED 2

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/common/messaging/ChatWindow.tsx:114` | respuesta rápida (emoji + texto) | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert (sin red: messageOutbox) | **OK** |
| `components/common/messaging/ChatWindow.tsx:154` | emoji de reacción (contador "1") | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState, no se guarda ni lo ve nadie más | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:166` | common.retry → "Retry" | `() => onRetry(m.id)` | messageOutbox.retry | **OK** |
| `components/common/messaging/ChatWindow.tsx:174` | chat.reply → "Reply" | `() => setReplyTo(m)` | setReplyTo: handleSend llama onSend(text) sin replyTo; metadata.replyTo nunca se guarda | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:180` | botones de reacción (REACTION_EMOJIS) | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:213` | respuesta rápida | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert | **OK** |
| `components/common/messaging/ChatWindow.tsx:245` | campo de mensaje (chat.type_message) | `(e) => { setNewMessage(e.target.value); if (e.target.value.l` | indicador "escribiendo" solo local (no hay presence realtime) | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:259` | chat.send → "Send message" | `() => handleSend()` | sendMessage → chat_messages insert / outbox | **OK** |
| `components/common/messaging/ChatWindow.tsx:264` | chat.record_voice (icono mic) | `() => setIsRecording(!isRecording)` | micrófono: solo cambia isRecording, no graba ni envía nada | **MAQUETA** |
| `components/common/messaging/NewChatModal.tsx:98` | icono check | `() => { if (mode === 'direct') onStartDirect(p.id); else tog` | getOrCreateConversation → conversations select/insert | **OK** |
| `components/common/messaging/NewChatModal.tsx:120` | chat.create_group_n → "Create Group ({n} members)" | `handleCreateGroup` | createChatGroup → conversations insert | **OK** |
| `components/modals/AddPickerModal.tsx:183` | — | `handleAdd` | crewSlice.addPicker → pickers insert (TL: su equipo; HR) / sin red: cola PICKER. Hora de inicio y fila no se guardan | **OK*** |
| `components/modals/PickerDetailsModal.tsx:158` | pd.remove_role | `handleDelete` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/RowAssignmentModal.tsx:131` | — | `handleAssign` | rowSlice.assignRows → row_assignments upsert + pickers.current_row + retire; ofrece a TODO el huerto (no solo su equipo) | **OK*** |
| `components/modals/picker-details/PickerProfileView.tsx:146` | common.save → "Save" | `handleSave` | updatePicker({status,current_row}) → trigger guard_picker_team_changes: TEAM_LEADER_CANNOT_MOVE_PICKERS si cambia status; error tragado, rollback sin aviso | **BLOQUEADO POR RLS** |
| `components/modals/picker-details/QuickMessageView.tsx:85` | pd.send_message → "Send Message" | `handleSendMessage` | TeamView no pasa onSendMessage: enseña "enviado" y no envía nada | **MAQUETA** |
| `components/modals/picker-details/RunnerProfileView.tsx:78` | common.save → "Save" | `handleSave` | updatePicker({status}) → trigger bloquea al TL cambiar status (sin aviso) | **BLOQUEADO POR RLS** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:136` | common.save → "Save" | `handleSave` | updatePicker({status}) → trigger (sin aviso) | **BLOQUEADO POR RLS** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:148` | pd.assigned_rows → "Assigned Rows" | `() => onAssignRow && setShowRowAssigner(true)` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:183` | pd.close_row_assign → "Close row assignment" | `() => setShowRowAssigner(false)` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:193` | assignModal.side → "Side" | `(e) => setRowInput(e.target.value)` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:204` | — | `() => setSideInput('north')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:208` | — | `() => setSideInput('south')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/picker-details/TeamLeaderProfileView.tsx:215` | — | `handleAssignRow` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/views/manager/TimesheetEditor.tsx:209` | — | `saveCorrection` | manage-attendance action=correct (runner: 403, ver Runner) | **OK** |
| `components/views/manager/TimesheetEditor.tsx:221` | — | `async () => { setGeneratingTimesheet(true); try { const data` | payrollService.generateDailyTimesheet → daily_attendance + bucket_records select | **OK** |
| `components/views/manager/TimesheetRow.tsx:151` | tse.save_correction → "Save correction" | `() => onSave(record)` | onSave → manage-attendance correct | **OK** |
| `components/views/team-leader/AttendanceView.tsx:123` | tl.attendance.check_out_name → "Check out {name}" | `() => item.attendanceRecord?.id && handleCheckOut(item.atten` | manage-attendance check_out (online; sin cobertura falla, la cola ATTENDANCE existe pero nadie encola) | **SIN RED** |
| `components/views/team-leader/AttendanceView.tsx:131` | tl.attendance.check_in_name → "Check in {name}" | `() => handleCheckIn(item)` | manage-attendance check_in (ídem) | **SIN RED** |
| `components/views/team-leader/HomeView.tsx:57` | tl.home.greeting → "Kia Ora, {name}" (cabecera clicable) | `() => onNavigate && onNavigate('profile')` | onNavigate('profile'): la pestaña 'profile' ya no existe → pantalla vacía | **ROTO** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnclosedShiftsAlert.tsx` (líneas 44) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnifiedMessagingView.tsx` (líneas 235) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/ChatWindow.tsx` (líneas 82, 230, 236) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/MessagingSidebar.tsx` (líneas 58, 65, 73, 78, 125, 133) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/NewChatModal.tsx` (líneas 44, 45, 64, 70, 73, 84, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/row-history/RowHistory.tsx` (líneas 61) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/AddPickerModal.tsx` (líneas 106, 113, 120, 130, 136, 144, 149, 174) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/PickerDetailsModal.tsx` (líneas 85, 148, 152) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/RowAssignmentModal.tsx` (líneas 64, 78, 87, 116) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/picker-details/ActivityHistoryView.tsx` (líneas 48) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/picker-details/PickerProfileView.tsx` (líneas 124, 130, 135, 147) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/picker-details/QuickMessageView.tsx` (líneas 46, 67, 77) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/picker-details/RunnerProfileView.tsx` (líneas 64, 70, 79) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/picker-details/TeamLeaderProfileView.tsx` (líneas 122, 128, 137) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/ModalOverlay.tsx` (líneas 51) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/Toast.tsx` (líneas 48) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/HeatMapView.tsx` (líneas 216, 277) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TimesheetEditor.tsx` (líneas 138) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TimesheetRow.tsx` (líneas 47, 62, 86, 138, 143, 168) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/team-leader/HomeView.tsx` (líneas 86, 115, 154) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/team-leader/TasksView.tsx` (líneas 122) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/team-leader/TeamView.tsx` (líneas 59, 95, 162, 179) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### Runner

Controles: 118 — OK 102, MAQUETA 5, INALCANZABLE 5, BLOQUEADO POR RLS 3, OK* 2, ROTO 1

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/common/SyncStatusMonitor.tsx:180` | sync.retry_sync → "Retry sync" | `handleManualSync` | syncService.processQueue → cola Dexie | **OK** |
| `components/common/SyncStatusMonitor.tsx:261` | sync.sync_now → "Sync Now" | `handleManualSync` | syncService.processQueue | **OK** |
| `components/common/SyncStatusMonitor.tsx:291` | — | `handleManualSync` | syncService.processQueue | **OK** |
| `components/common/messaging/ChatWindow.tsx:114` | respuesta rápida (emoji + texto) | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert (sin red: messageOutbox) | **OK** |
| `components/common/messaging/ChatWindow.tsx:154` | emoji de reacción (contador "1") | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState, no se guarda ni lo ve nadie más | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:166` | common.retry → "Retry" | `() => onRetry(m.id)` | messageOutbox.retry | **OK** |
| `components/common/messaging/ChatWindow.tsx:174` | chat.reply → "Reply" | `() => setReplyTo(m)` | setReplyTo: handleSend llama onSend(text) sin replyTo; metadata.replyTo nunca se guarda | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:180` | botones de reacción (REACTION_EMOJIS) | `() => toggleReaction(msgId, emoji)` | toggleReaction: solo useState | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:213` | respuesta rápida | `() => handleSend('${qr.emoji} ${t(qr.label)}')` | sendMessage → chat_messages insert | **OK** |
| `components/common/messaging/ChatWindow.tsx:245` | campo de mensaje (chat.type_message) | `(e) => { setNewMessage(e.target.value); if (e.target.value.l` | indicador "escribiendo" solo local (no hay presence realtime) | **MAQUETA** |
| `components/common/messaging/ChatWindow.tsx:259` | chat.send → "Send message" | `() => handleSend()` | sendMessage → chat_messages insert / outbox | **OK** |
| `components/common/messaging/ChatWindow.tsx:264` | chat.record_voice (icono mic) | `() => setIsRecording(!isRecording)` | micrófono: solo cambia isRecording, no graba ni envía nada | **MAQUETA** |
| `components/common/messaging/NewChatModal.tsx:98` | icono check | `() => { if (mode === 'direct') onStartDirect(p.id); else tog` | getOrCreateConversation → conversations select/insert | **OK** |
| `components/common/messaging/NewChatModal.tsx:120` | chat.create_group_n → "Create Group ({n} members)" | `handleCreateGroup` | createChatGroup → conversations insert | **OK** |
| `components/modals/QualityRatingModal.tsx:31` | qc.modal.class_a → "Class A" | `() => onRate('A')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/QualityRatingModal.tsx:35` | qc.modal.class_b → "Class B" | `() => onRate('B')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/QualityRatingModal.tsx:39` | qc.modal.class_c → "Class C" | `() => onRate('C')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/QualityRatingModal.tsx:43` | qc.modal.reject → "REJECT" | `() => onRate('reject')` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/QualityRatingModal.tsx:50` | qc.modal.cancel_scan → "Cancel Scan" | `onCancel` | código que la pantalla no muestra | **INALCANZABLE** |
| `components/modals/ScannerModal.tsx:238` | — | `handleManualSubmit` | manual → handleScanComplete → addBucket → Dexie → record-bucket | **OK** |
| `components/modals/ScannerModal.tsx:277` | scanner.scan_again → "Scan Again" | `startNativeScan` | cámara nativa → handleScanComplete | **OK** |
| `components/modals/ScannerModal.tsx:337` | runner.scanner.complete_batch → "Complete Batch ({n})" | `() => { if (onBatchScan) onBatchScan(scannedCodes); onClose(` | lote → addBucket ×N → Dexie → record-bucket | **OK** |
| `components/views/manager/TimesheetEditor.tsx:209` | — | `saveCorrection` | manage-attendance requireRole(admin,manager,team_leader) → 403 para el runner | **BLOQUEADO POR RLS** |
| `components/views/manager/TimesheetEditor.tsx:221` | — | `async () => { setGeneratingTimesheet(true); try { const data` | funciona y enseña horas y PAGO de todo el huerto al runner (RLS Read attendance por huerto) | **OK*** |
| `components/views/manager/TimesheetRow.tsx:151` | tse.save_correction → "Save correction" | `() => onSave(record)` | ídem: 403 | **BLOQUEADO POR RLS** |
| `components/views/manager/TimesheetRow.tsx:168` | tse.edit_of → "Edit {name}\'s timesheet" | `() => onStartEdit(record)` | abre la edición de un fichaje ajeno que luego no puede guardar | **BLOQUEADO POR RLS** |
| `components/views/runner/LogisticsView.tsx:280` | runner.request_refill → "Request Refill" | `handleRefillRequest` | createTransportRequest → cola TRANSPORT create → transport_requests insert | **OK** |
| `components/views/runner/WarehouseView.tsx:152` | runner.warehouse.request_transport → "Request Transport" | `onTransportRequest` | ídem (handleRequestRefill) | **OK** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/SyncStatusMonitor.tsx` (líneas 202) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnifiedMessagingView.tsx` (líneas 235) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/ChatWindow.tsx` (líneas 82, 230, 236) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/MessagingSidebar.tsx` (líneas 58, 65, 73, 78, 125, 133) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/messaging/NewChatModal.tsx` (líneas 44, 45, 64, 70, 73, 84, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/ScannerModal.tsx` (líneas 201, 250, 325) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/ModalOverlay.tsx` (líneas 51) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/Toast.tsx` (líneas 48) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TimesheetEditor.tsx` (líneas 138) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/manager/TimesheetRow.tsx` (líneas 47, 62, 86, 138, 143) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/runner/LogisticsView.tsx` (líneas 101, 140, 293, 300) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/runner/RunnersView.tsx` (líneas 26) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### QC inspector

Controles: 79 — OK 76, OK* 2, ROTO 1

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/views/qc/InspectTab.tsx:524` | botones de nota A/B/C/Reject (gradeLabel) | `() => handleTurboGrade(grade)` | handleGrade → Storage qc-photos + qc_inspections insert / sin red: cola QC_INSPECTION (la foto se pierde) | **OK*** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/FilterBar.tsx` (líneas 95, 115, 125, 171, 176, 190, 197, 222) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/qc/HistoryTab.tsx` (líneas 185, 220, 234) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/qc/InspectTab.tsx` (líneas 244, 280, 300, 339, 356, 391, 432, 447, 466, 474, 492) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### Admin

Controles: 73 — OK 70, OK* 2, ROTO 1

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/AuditLogViewer.tsx:121` | "Refresh" (literal) | `() => { refetch(); }` | audit.repository → audit_logs select (RLS: manager/admin) | **OK** |
| `components/AuditLogViewer.tsx:129` | "Export" (literal) | `exportToCSV` | CSV en el navegador | **OK** |
| `components/common/SetupWizard.tsx:174` | botón final del asistente ("Creating..." literal) | `handleSubmit` | rpc setup_orchard_atomic (solo admin): crea orchards + harvest_settings + day_setups; NO crea temporada, bloques ni filas | **OK*** |
| `pages/admin/AdminUsersTab.tsx:93` | icono person_off | `() => onToggleActive(user)` | manage-admin deactivate/reactivate | **OK** |
| `pages/admin/AdminUsersTab.tsx:104` | admin.change_role → "Change role for {name}" | `(e) => onRoleChange(user.id, e.target.value)` | manage-admin update_role | **OK** |
| `components/AuditLogViewer.tsx` (líneas 67, 85, 108, 215) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/SetupWizard.tsx` (líneas 109, 146, 157, 165) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/setup-wizard/OrchardStep.tsx` (líneas 15, 25, 36, 49) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/setup-wizard/RatesStep.tsx` (líneas 16, 31, 42) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `pages/admin/AdminOrchardsTab.tsx` (líneas 23) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `pages/admin/AdminUsersTab.tsx` (líneas 53, 61) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### RRHH (hr_admin)

Controles: 138 — OK 135, OK* 2, ROTO 1

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/modals/AddPickerModal.tsx:183` | — | `handleAdd` | crewSlice.addPicker → pickers insert (TL: su equipo; HR) / sin red: cola PICKER. Hora de inicio y fila no se guardan | **OK*** |
| `components/views/hhrr/CalendarTab.tsx:304` | hr.agenda.cancel_leave → "Cancel leave" | `() => handleDecision(leave.id, 'cancelled')` | leave.service → leave_requests update status=cancelled | **OK** |
| `components/views/hhrr/CalendarTab.tsx:317` | hr.contracts.confirm → "Confirm" | `() => handleDecision(leave.id, deciding.action, note)` | leave_requests update approved/rejected + decision_note | **OK** |
| `components/views/hhrr/CalendarTab.tsx:356` | — | `handleCreate` | leave_requests insert | **OK** |
| `components/views/hhrr/ContractsTab.tsx:263` | icono attach_money | `(val) => run(emp, () => changeContract(emp.contract_id!, { e` | changeContract → contracts update end_date | **OK** |
| `components/views/hhrr/ContractsTab.tsx:275` | common.per_hour → "/hr" | `(val) => run(emp, () => changeContract(emp.contract_id!, { h` | contracts update hourly_rate | **OK** |
| `components/views/hhrr/ContractsTab.tsx:297` | hr.contracts.view_pdf → "View PDF" | `() => handleViewPdf(emp)` | Storage hr-documents createSignedUrl | **OK** |
| `components/views/hhrr/ContractsTab.tsx:319` | — | `e => { const file = e.target.files?.[0]; e.target.value = ''` | Storage hr-documents upload + hr_documents insert (contract_id) | **OK** |
| `components/views/hhrr/ContractsTab.tsx:336` | hr.contracts.create → "Create contract" | `(form) => handleCreate(emp, form)` | contracts insert (+PDF) | **OK** |
| `components/views/hhrr/ContractsTab.tsx:354` | — | `(form) => handleRenew(emp, form)` | contracts insert (renovación) + update del anterior | **OK** |
| `components/views/hhrr/ContractsTab.tsx:372` | hr.contracts.confirm → "Confirm" | `() => handleTerminate(emp)` | contracts update status=terminated | **OK** |
| `components/views/hhrr/ContractsTab.tsx:472` | common.cancel → "Cancel" | `() => onSave(form)` | onSave(form) → handleCreate | **OK** |
| `components/views/hhrr/ContractsTab.tsx:498` | common.cancel → "Cancel" | `() => onSave(form)` | onSave(form) → handleRenew | **OK** |
| `components/views/hhrr/DocumentsTab.tsx:166` | hr.docs.download | `() => handleDownload(doc)` | Storage hr-documents createSignedUrl | **OK** |
| `components/views/hhrr/DocumentsTab.tsx:174` | hr.docs.delete → "Delete" | `() => handleDelete(doc)` | hr_documents update deleted_at + Storage remove | **OK** |
| `components/views/hhrr/DocumentsTab.tsx:341` | — | `handleSubmit` | Storage upload + hr_documents insert | **OK** |
| `components/views/hhrr/EmployeesTab.tsx:142` | — | `(val) => update(emp, { status: val as Employee['status'] })` | setEmployeeActive → users.is_active (RRHH) o pickers.status | **OK** |
| `components/views/hhrr/agenda/NewLeaveModal.tsx:133` | common.cancel → "Cancel" | `submit` | leave_requests insert (approveNow → approved) | **OK** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/modals/AddPickerModal.tsx` (líneas 106, 113, 120, 130, 136, 144, 149, 174) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/FilterBar.tsx` (líneas 95, 115, 125, 171, 176, 190, 197, 222) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineEdit.tsx` (líneas 102, 116) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineSelect.tsx` (líneas 74, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/ModalOverlay.tsx` (líneas 51) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/hhrr/CalendarTab.tsx` (líneas 169, 172, 175, 186, 196, 227, 300, 301, 315, 320) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/hhrr/ContractsTab.tsx` (líneas 340, 362, 379, 387, 418, 452, 460, 463, 466, 469, 471, 493, 495, 497) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/hhrr/DocumentsTab.tsx` (líneas 121, 264, 279, 290, 300, 315, 326, 333) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/hhrr/EmployeesTab.tsx` (líneas 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/hhrr/agenda/NewLeaveModal.tsx` (líneas 82, 87, 94, 106, 111, 115, 118, 122, 126, 132) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### Logística

Controles: 78 — OK 74, SIN HANDLER 2, OK* 1, ROTO 1

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/views/logistics/FleetTab.tsx:122` | logi.assign_driver → "Assign driver..." | `(val) => onUpdateTractor?.(tractor.id, { driver_name: val })` | LogisticsWorkspace renderiza <FleetTab tractors> sin onUpdateTractor: el InlineEdit se edita y no guarda nada | **SIN HANDLER** |
| `components/views/logistics/FleetTab.tsx:135` | selector de estado del vehículo (active/idle/maintenance/offline) | `(val) => onUpdateTractor?.(tractor.id, { status: val as Trac` | sin onUpdateTractor: el estado del vehículo no se guarda | **SIN HANDLER** |
| `components/views/logistics/RequestsTab.tsx:191` | logi.confirm → "Confirm" | `() => handleAssign(req.id, req.updated_at)` | assignTransportRequest → cola TRANSPORT assign → transport_requests update (lock optimista) | **OK** |
| `components/views/logistics/RequestsTab.tsx:215` | logi.cancel_request → "Cancel request" | `() => handleCancel(req.id, req.updated_at)` | cola TRANSPORT cancel → transport_requests status=cancelled | **OK** |
| `components/views/logistics/RequestsTab.tsx:230` | logi.mark_completed | `() => handleComplete(req.id, req.updated_at)` | cola TRANSPORT complete → status=completed, completed_at | **OK** |
| `components/views/logistics/RequestsTab.tsx:237` | logi.cancel_request → "Cancel request" | `() => handleCancel(req.id, req.updated_at)` | cola TRANSPORT cancel | **OK** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/EmptyState.tsx` (líneas 58) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/FilterBar.tsx` (líneas 95, 115, 125, 171, 176, 190, 197, 222) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineEdit.tsx` (líneas 102, 116) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/ui/InlineSelect.tsx` (líneas 74, 90) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/logistics/LogisticsWorkspace.tsx` (líneas 122) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/logistics/RequestsTab.tsx` (líneas 178, 198, 208) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |

### Nómina (payroll_admin)

Controles: 77 — OK 71, OK* 4, ROTO 2

| Archivo:línea | Control (clave → texto en) | Handler | Destino / nota | Veredicto |
|---|---|---|---|---|
| `components/common/Header.tsx:129` | common.sign_out → "Sign Out" | `handleSignOut` | signOut (auth) | **OK** |
| `components/common/OrchardSwitcher.tsx:67` | — | `() => { if (!isActive) { switchOrchard(orchard.id); } setIsO` | switchOrchard → users.orchard_id update (propio). Cualquier rol puede cambiarse a cualquier huerto | **OK** |
| `components/views/payroll/ExportHistoryTab.tsx:93` | pay.hist.clear_all → "Clear All" | `handleClearAll` | localStorage (historial solo en ese navegador, sin auditoría en servidor) | **OK*** |
| `components/views/payroll/ExportHistoryTab.tsx:130` | hr.docs.delete → "Delete" | `() => handleDelete(record.id)` | localStorage | **OK*** |
| `components/views/payroll/ExportTab.tsx:107` | icono exp | `() => handleExport(exp.format)` | calculate-payroll → exportService (CSV Xero/PaySauce) | **OK** |
| `components/views/payroll/PayWeekCloseBar.tsx:58` | pay.close.confirm_reopen → "Confirm reopen" | `() => onReopen(reason.trim())` | close-pay-week action=reopen | **OK** |
| `components/views/payroll/PayWeekCloseBar.tsx:95` | pay.close.yes → "Yes, close it" | `() => { setConfirming(false); onClose(); }` | close-pay-week action=close | **OK** |
| `components/views/payroll/TimesheetsTab.tsx:115` | pay.ts.approve_all → "Approve all ({count})" | `handleApproveAll` | approveTimesheets manda {items:[…]}; approve-timesheet solo acepta {attendance_id} (lote borrado en 0bfab88f) → 400, todas fallan | **ROTO** |
| `components/views/payroll/TimesheetsTab.tsx:152` | pay.ts.approve → "Approve" | `() => handleApprove(ts.id, ts.picker_name)` | approve-timesheet → rpc review_timesheet | **OK** |
| `components/views/payroll/TimesheetsTab.tsx:155` | pay.ts.reject → "Reject" | `() => handleReject(ts.id, ts.picker_name)` | approve-timesheet decision=reject (sin campo de motivo: rejection_reason queda null) | **OK*** |
| `components/common/BottomNav.tsx` (líneas 43) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/Header.tsx` (líneas 93, 120) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/OrchardSwitcher.tsx` (líneas 41) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/common/UnclosedShiftsAlert.tsx` (líneas 44) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/payroll/PayWeekCloseBar.tsx` (líneas 41, 50, 63, 89, 98) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/payroll/PayWeekDetail.tsx` (líneas 31, 32, 40) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/payroll/PayrollDashboard.tsx` (líneas 65) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `components/views/payroll/WageCalculatorTab.tsx` (líneas 26, 30) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
| `pages/Payroll.tsx` (líneas 57, 64) | pestañas, cerrar, filtros, campos de formulario | setState / onClose / onTabChange | estado local o navegación | OK |
## 3. Matriz tablas × roles

Leyenda de roles: MGR manager, TL team_leader, RUN runner, QC qc_inspector, ADM admin, HR hr_admin, LOG logistics, PAY payroll_admin. «App lee» y «App escribe» salen del inventario: pantallas, servicios y Edge Functions que llama cada rol. «RLS» resume `pg_policies` de la base local. Las políticas restrictivas de 2FA (`mfa_satisfied`) aplican a todas las tablas y no se repiten.

| Tabla | App lee | App escribe | RLS permite | Discrepancias |
|---|---|---|---|---|
| account_locks | — | — | ALL MGR/ADM | **Sin uso**: `authHardening.service.ts` y `auth.repository.ts` están muertos |
| allowed_registrations | el que se registra (su email) | nadie (el `update used_at` de `auth-context.repository.ts:126` lo bloquea la RLS; lo hace el trigger) | ALL HR/MGR/ADM; SELECT del propio email | **Nadie la escribe desde la app**: sin invitaciones no hay altas (problema 2) |
| audit_logs | ADM (`AuditLogViewer`) | todos vía `submit-audit-log` y Edge Functions; MGR directo (`DayClosureButton.tsx:167`, ROTO) | INSERT propio; SELECT MGR/ADM | MGR puede leer pero no tiene visor; inserts directos rotos (DayClosure; mpi/data-export muertos) |
| bins | RUN, MGR (inventario), LOG (BinsTab) | RUN (alta y estado, solo con red) | SELECT huerto; INSERT **cualquier miembro del huerto** («Runners insert bins» solo mira el huerto); UPDATE RUN/LOG + MGR/TL («Manage bins») | LOG puede escribir y no tiene UI; QC/PAY/HR pueden insertar bins por RLS |
| block_rows | todos (mapa, variedades) | **nadie** (seeds) | SELECT `true` (todos los huertos) + del huerto; ALL MGR/ADM | Se lee y nadie la escribe: huerto nuevo sin filas |
| broadcasts | todos (campana, TL Tasks) | MGR | INSERT/UPDATE/DELETE MGR/ADM; SELECT por huerto y `target_roles` | OK (confirmación por rpc `acknowledge_broadcast`) |
| bucket_records | MGR, TL (store + realtime), PAY/HR (calculate-payroll), MGR (análisis) | RUN/TL/MGR vía `record-bucket` (cliente del usuario) | INSERT ADM o MGR/TL/RUN del huerto (no picker archivado); SELECT huerto + nómina empresa + legado `bucket_records_view_policy` (MGR todos los huertos, **incluidas borradas**); UPDATE/DELETE MGR (no en día cerrado) | MGR puede corregir y borrar cubetas por RLS, pero no hay UI |
| chat_messages | MGR, TL, RUN (chat) | MGR, TL, RUN | por `participant_ids` | QC/HR/LOG/PAY/ADM no tienen pantalla de chat pero salen en la lista de contactos (`simple-messaging.service.ts:62`, sin filtro de rol ni de `is_active`): les escriben y nunca lo leen |
| contracts | HR; PAY y HR vía calculate-payroll (`payroll-calc.ts:255`) | HR | ALL HR/ADM (toda la empresa); SELECT MGR+HR del huerto, nómina empresa, el propio empleado | El empleado puede leer su contrato y no hay UI («Mi cuenta» no lo enseña) |
| conversations | MGR, TL, RUN | MGR, TL, RUN | INSERT/SELECT si estás en `participant_ids` | OK |
| daily_attendance | TL (pase de lista, hoja), MGR, RUN (hoja: **todo el huerto**), PAY, HR | TL/MGR vía `manage-attendance` (entrada, salida, corrección); PAY vía `approve-timesheet` (rpc `review_timesheet`) | ALL ADM, o MGR/TL/HR del huerto; **UPDATE MGR/TL sin huerto** (`attendance_update_policy`); SELECT por huerto (cualquier rol) + legado (MGR todos) + nómina; nunca la fila propia | TL no limitado a su equipo; RUN/QC/LOG leen los fichajes de todos; HR puede escribir y no tiene UI |
| day_closures | MGR (analytics) | MGR (`DayClosureButton`) | ALL MGR/ADM del huerto; SELECT **todo autenticado** (`authenticated_select_day_closures`) | La app no la lee para saber si hoy está cerrado (problema 9) |
| day_setups | MGR (historial picker) | ADM (rpc de alta) | ALL MGR/ADM; SELECT huerto | Solo la escribe el alta del huerto (un día) |
| fleet_vehicles | LOG, MGR, (RUN en #70) | **nadie** (FleetTab sin handler) | ALL LOG/MGR/ADM del huerto | Se lee y nadie la escribe: solo seeds |
| harvest_seasons | todos (mapa) | **nadie** | SELECT `true` + huerto; ALL MGR/ADM | Se lee y nadie la escribe; `setup_orchard_atomic` no crea temporada |
| harvest_settings | todos (store), Edge Functions | MGR (Ajustes), ADM (alta) | SELECT `true`/cualquier usuario (todos los huertos); ALL MGR del huerto, ADM | Lectura entre huertos abierta (3 políticas `true`); el selector de huerto de Ajustes choca con la RLS |
| hr_documents | HR; MGR (lista por RLS, sin UI); avisos de visado (`notification.service.ts:127`) | HR | ALL HR/ADM; SELECT MGR; SELECT el propio | MGR puede listar, pero Storage `hr-documents` solo deja leer a HR/ADM |
| leave_requests | HR | HR | INSERT HR/ADM, o MGR/TL `requested` del huerto; SELECT MGR/TL/RUN/QC/LOG del huerto + HR/PAY/ADM; UPDATE HR/ADM/MGR | **Dato que solo usa RRHH**: TL/MGR pueden pedir y leer por RLS y no tienen UI; la nómina no la usa |
| login_attempts | — | — | SELECT MGR/ADM | **Sin uso** |
| messages | — | — (el procesador `MESSAGE` de `sync-queue/dispatchItem.ts:39` llama `sendMessage(receiverId, content, type)` con los argumentos cambiados) | por remitente/destinatario | **Tabla muerta** (sustituida por chat_messages) |
| orchard_blocks | todos (mapa) | **nadie** | SELECT `true` + huerto; ALL MGR/ADM | Se lee y nadie la escribe |
| orchards | todos | ADM (rpc), cada usuario su `orchard_id` vía users | SELECT todos los activos; INSERT ADM; UPDATE MGR (el suyo)/ADM | OK |
| pay_weeks | PAY | `close-pay-week` | SELECT `can_read_company_payroll` | OK (no tiene orchard_id: semana de toda la empresa, coherente con «una instalación = una empresa») |
| pickers | todos | TL (alta y edición de su equipo), HR (todo), MGR (vincular/desvincular TL y runners, `current_row`), trigger `sync_person_from_user` | SELECT **cualquier miembro activo, todos los huertos**; ALL HR/ADM; INSERT TL (su equipo) y MGR; UPDATE MGR (`is_manager()`, **sin huerto**) y TL (su equipo o sin equipo); trigger `guard_picker_team_changes` | El TL cambia `status` desde el modal y el trigger lo rechaza (problema 7); MGR actualiza pickers de cualquier huerto |
| pickers_performance_today (vista) | TL (`picker.service.ts:12`, cada pase de lista) | — | `security_invoker` | **Rota**: filtra `users.role='picker'` (no existe), devuelve `id/buckets_today` y el código lee `picker_id/total_buckets`; siempre 0; consulta inútil |
| privacy_consent_log | — (solo `data-export.service.ts`, muerto) | todos (consentimiento) | INSERT/SELECT el propio | Se escribe y nadie lo lee (aceptable: registro legal) |
| push_subscriptions | — | — | ALL el propio | **Sin uso** (problema 4) |
| qc_inspections | QC, MGR (cajón), avisos locales | QC (y MGR/ADM por RLS) | ALL MGR/QC/ADM del huerto; SELECT huerto | TL puede leer por RLS y no tiene UI; `recentQcInspections` se llena y nadie lo lee |
| quality_inspections | MGR (`picker-history.repository.ts:75`) | nadie | **ninguna política permisiva** → 0 filas | **Tabla muerta** que aún se consulta en cada apertura del cajón |
| rejected_scans | MGR (`RejectedScansAlert`) | `record-bucket` | INSERT el que escanea; SELECT MGR/ADM + el propio TL/RUN | RUN usa su lista local (Dexie), no la tabla |
| row_assignments | MGR, TL, RUN (`rowOf`) | MGR, TL | ALL ADM o MGR/TL del huerto; SELECT huerto | TL puede asignar y retirar filas de **cualquier equipo** (en esta rama también desde la UI, `TasksView.tsx:51`; #71 lo limita en pantalla, no en RLS) |
| security_settings | (solo `mfa_satisfied`, SECURITY DEFINER) | — | solo la restrictiva | OK (no se expone) |
| sync_conflicts | — | — (los conflictos van a Dexie, `db.ts:131`) | INSERT propio; SELECT MGR (cualquiera) | **Sin uso** |
| transport_requests | LOG, MGR; RUN (solo en #70) | RUN (crear), LOG/MGR (asignar, completar, cancelar), RUN (cancelar la suya, #70) | INSERT «Create transport» (**cualquier miembro, cualquier `requested_by`**) + «Create transport requests»; UPDATE LOG/MGR; UPDATE solicitante pending→cancelled | Se puede crear a nombre de otro (política duplicada y laxa); el runner no ve el estado en esta rama |
| users | todos | uno mismo (perfil por rpc, consentimiento, huerto), MGR (vincular), HR (`is_active`), ADM (`manage-admin`) | SELECT uno mismo, MGR/ADM todo, mismo huerto; UPDATE MGR/ADM todo (`Users update own profile` sin WITH CHECK) + HR + uno mismo; trigger `guard_user_changes` | El trigger sujeta rol, activo y huerto. **Cualquier rol puede cambiarse de huerto a sí mismo** (`OLD.id = v_uid`), así que «logística por huerto» no es una frontera |
| variety_rates | todos (store), Edge (pago) | MGR (`VarietyRatesEditor`) | ALL MGR/ADM **sin filtro de huerto**; SELECT miembros | Un manager puede cambiar las tarifas de otro huerto |
| wage_rates | — | — (`wage-rates.service.ts` muerto: `effective_from` no existe, `onConflict 'orchard_id,job_type'` sin índice) | ALL MGR/ADM/HR/PAY; SELECT huerto | **Sin uso** |

Tablas que nadie usa desde la app: `account_locks`, `login_attempts`, `messages`, `push_subscriptions`, `quality_inspections` (se consulta, pero la RLS la deja vacía), `sync_conflicts`, `wage_rates`.

Tablas que se leen y nadie escribe (solo seeds): `harvest_seasons`, `orchard_blocks`, `block_rows`, `fleet_vehicles`, `allowed_registrations`.

## 4. Pares productor → consumidor

Vía de aviso: **RT** = realtime (canal `harvest-live-<huerto>` de `stores/storeSync.ts`: INSERT `bucket_records`, `*` `daily_attendance`, INSERT `qc_inspections`, `*` `row_assignments`; `logistics-realtime`: `transport_requests` y `fleet_vehicles`; `public:broadcasts`; `my-chat-messages`). **REC** = al recargar o volver a la pestaña.

| Par | Productor (escribe) | Consumidor (lee) | Vía | Veredicto |
|---|---|---|---|---|
| Runner escanea cubeta → manager | `record-bucket` → `bucket_records` (orchard_id del runner) | store `bucketRecords` (mismo huerto) | RT INSERT | **OK** |
| → TL | ídem | `TasksView` / `HomeView` (store) | RT | **OK** (el progreso de fila usa `toDateString()` del navegador, no la fecha NZ: `TasksView.tsx:45`) |
| → nómina | ídem | `calculate-payroll` (por `scanned_at`, `variety`) | REC (al abrir o cambiar semana) | **OK** |
| Corrección o borrado de cubeta por el manager | (no hay UI) | — | — | n/a; además el canal solo escucha INSERT: un UPDATE o DELETE de cubeta no llegaría |
| TL pase de lista (entrada/salida) → manager | `manage-attendance` → `daily_attendance` | store (`daily_attendance` `*`) | RT | **OK** |
| → nómina / RRHH | ídem | `payroll.repository.ts:58` / calculate-payroll | REC | **OK** |
| TL descanso | no hay botón: `break_start` solo entra por corrección (`TimesheetRow.tsx:86`) | `shiftHours` | — | **A MEDIAS**: el TL ve el aviso «sin descanso» (`useAttendance.ts:90`) pero no puede apuntarlo desde el pase de lista |
| Corrección de fichaje → nómina y auditoría | `manage-attendance correct` (+ `writeAudit` → `audit_logs`; trigger `clear_timesheet_rejection` la devuelve a pendiente) | `TimesheetsTab` (vuelve a pendiente), `AuditLogViewer` (admin) | REC | **OK** (nómina sin realtime) |
| Nómina aprueba/rechaza → TL y runner | rpc `review_timesheet` → `verified_by` / `rejected_at` / `rejection_reason` | `TimesheetRow` del TL y manager **no lo enseña**; el runner (esta rama) tampoco | — | **ROTO** (problema 6) |
| QC inspección → manager | `qc_inspections` insert | cajón del picker (`picker-history.repository.ts:73`); alerta local de rechazo >15 % (`notification.service.ts:150`) | REC / sondeo local | **A MEDIAS**: `recentQcInspections` (RT) no lo lee nadie |
| → TL | ídem | ninguna vista | — | **ROTO** (problema 5) |
| Solicitud de transporte (runner) → logística | cola `TRANSPORT create` → `transport_requests` | `RequestsTab` | RT `logistics-realtime` | **OK** |
| Solicitud de transporte (TL) | el TL no tiene botón de transporte | — | — | **A MEDIAS** (falta en la UI del TL) |
| Logística asigna/completa → runner | cola `TRANSPORT assign/complete` → `transport_requests` | en esta rama, nada en el runner | — | **ROTO** en integración; #70 añade «Mis solicitudes» (`useRunnerWarehouse.ts`), por REC, sin realtime |
| Logística asigna vehículo → flota | solo `assigned_vehicle` en la solicitud | `fleet_vehicles` no cambia (ni estado ni carga) | — | **A MEDIAS** |
| Manager broadcast → TL/runner/QC | `broadcasts` insert (sin `target_roles`, para todos) | `NotificationPanel` (todos), `TasksView` del TL (alerta alta/urgente) | RT `public:broadcasts` + notificación local | **OK** (sin push: con la app cerrada no llega) |
| Chat → todos | `chat_messages` | `UnifiedMessagingView` (MGR/TL/RUN) | RT (`chat:<id>`, `my-chat-messages`) + sondeo | **A MEDIAS**: QC, RRHH, logística, nómina y admin no tienen pantalla de chat pero se les puede escribir |
| RRHH contrato → nómina | `contracts` | `payroll-calc.ts:255` (`hourly_rate`, activo/por vencer) | REC | **OK** |
| → TL / manager | ídem | ninguna vista | — | n/a (no hace falta) |
| RRHH ausencia → nómina / TL / manager | `leave_requests` | nadie fuera de RRHH | — | **ROTO** (problema 15) |
| Manager ajustes (precio, mínimo, meta, variedad) → TL/runner | `harvest_settings` upsert | store `settings` (`TasksView.tsx:23-25` objetivo cubetas/h) | REC (`harvest_settings` no está en realtime) | **A MEDIAS** |
| → nómina / Edge Functions | `harvest_settings`, `variety_rates` | `calculate-payroll`, trigger `set_bucket_variety` | lectura directa | **OK** |
| Admin alta de usuario → login | no hay alta (problema 2) | `check_registration` / `guard_user_changes` | — | **ROTO** |
| Admin baja/reactivación → login, RRHH, listas | `manage-admin` → `users.is_active` (+ `sync_person_from_user` → `pickers.status`) | `is_role()` (todas las RLS), lista de RRHH | inmediato en el servidor | **OK** (la lista de chat no filtra `is_active`) |
| Admin cambio de rol | `manage-admin update_role` (+ `auth.users` metadata por trigger) | rutas por rol al volver a entrar | REC | **OK** |
| Manager asigna filas → TL mapa/filas | `row_assignments` upsert + retire + `pickers.current_row` | store `rowAssignments` (TL `TasksView`) | RT `row_assignments` | **OK** |
| Cierre del día → bloqueo cubetas/fichajes | `day_closures` insert | trigger `enforce_closed_day_bucket_records` (INSERT posterior al cierre) y RLS restrictivas UPDATE/DELETE de `bucket_records` | servidor | **A MEDIAS**: los fichajes no se bloquean por día (solo por semana de pago cerrada); TL y runner no se enteran del cierre; el manager lo olvida al recargar |
| Bins: runner ↔ logística | `bins` (alta, estado; solo con red) | `BinsTab` (useLogistics) | REC (`bins` no está en realtime; `logistics-realtime` no recarga bins) | **A MEDIAS**; logística no puede cambiar bins (no hay UI) |
| Mi cuenta (nombre) → cabecera y otros roles | rpc `update_my_profile` → `users.full_name` → trigger → `pickers.name` | cabecera, listas del store, chat | REC | **OK** |
| Mi cuenta (foto) → cabecera y otros roles | Storage `avatars` + `users.avatar_url` | `UserAvatar` en cabecera, `DesktopLayout`, `TeamLeaderCard` y cajón del manager (`avatar.repository.ts:16`) | REC | **A MEDIAS**: el TL y el runner nunca ven fotos de otros (sus vistas no usan `UserAvatar`) |
| Notificaciones push | — | `send-push` | — | **ROTO** (no existe el circuito; problema 4) |

## 5. Otros hallazgos sueltos (con archivo:línea)

- `src/components/views/team-leader/HomeView.tsx:57`: `onNavigate('profile')`, pero `config/navigation/team-leader.nav.ts` ya no tiene `profile`, así que `pages/TeamLeader.tsx` no pinta nada (pantalla en blanco). #71 no lo cambia.
- `src/hooks/useRunnerData.ts:264-280`: el escaneo guarda siempre `quality_grade:'A'`. `QualityRatingModal` (`pages/Runner.tsx:161`) solo aparece si `qualityScan.step === 'QUALITY'`, y **nadie** pone ese paso (grep), así que está inalcanzable. Si la nota la da el QC, el modal sobra; si la da el runner, falta el paso.
- `src/hooks/useRunnerData.ts:266-269`: el aviso «no está fichado» sale cuando el código no está en `crew` (toda la plantilla), no cuando no tiene entrada hoy. El texto engaña.
- `src/components/modals/AddPickerModal.tsx:144,149`: «hora de inicio» y «fila asignada» se piden y no se guardan (`NewPickerData` no las usa; `current_row: 0`).
- `src/services/fraud-detection.service.ts:62,115`: «Smart dismissals» y el contador «Dismissed» de `AnomalyDetectionView.tsx:101` son una lista fija en el código (**MAQUETA de datos**).
- `src/components/views/manager/DashboardView.tsx:124-139`: el CSV «Export» calcula con un único `piece_rate` (no las tarifas por variedad, que sí usa la nómina) y pone `pending_queue_count: 0` fijo.
- `src/services/picker.service.ts:12-17`: cada pase de lista del TL consulta `pickers_performance_today` (siempre vacía) y, si no hay filas, hace un `count` extra de diagnóstico.
- `src/services/sync-processors/picker.processor.ts:10-11`: para un alta sin red baja **todos** los pickers del huerto sin paginar y busca coincidencia por `picker_id`. Si el código ya lo usa otra persona, actualiza el nombre de esa otra persona en lugar de dar error.
- `src/services/sync-queue/dispatchItem.ts:39`: el handler `MESSAGE` llama `simpleMessagingService.sendMessage(msgData.receiverId, msgData.content, msgData.type)`, pero la firma es `(conversationId, senderId, content)`. Hoy no lo usa nadie (el chat va por `messageOutbox`); conviene borrarlo.
- `harvest_settings_min_wage_floor CHECK (min_wage_rate >= 23.95)` y `setup_orchard_atomic(p_min_wage DEFAULT 23.95)` tienen el salario mínimo escrito a mano en la BD. El 1-4-2027 habrá que cambiarlo con migración, igual que `NZ_MIN_WAGE_HISTORY`.
- `src/hooks/useQC.ts:97-130`: sin red, la foto no sube y la inspección se encola sin `photo_url`: la foto se pierde.
- `src/components/views/payroll/ExportHistoryTab.tsx:31`: el historial de exportaciones de nómina vive en `localStorage` (por navegador). No queda constancia en el servidor de qué semana se exportó ni quién lo hizo.

## 6. Ramas #70 (fix/runner-review) y #71 (fix/team-leader-review)

`git fetch` hecho; diff contra `origin/main`. Ninguna toca Edge Functions de nómina ni la regresión `0bfab88f`.

**#70 fix/runner-review** (3 commits: «My hours», almacén con solicitudes propias y bins por zona, «runners en el huerto»):
- **Arregla el problema 3**: `pages/Runner.tsx` cambia `TimesheetEditor` por `components/views/runner/MyTimesheetView.tsx`, que lee solo `daily_attendance` del propio runner (`my-timesheet.service.ts:60`). La «petición de corrección» la manda por chat directo al manager (`my-timesheet.service.ts:96-119`: busca o crea la conversación y hace `chat_messages` insert). Funciona, pero la petición no queda como dato estructurado (el manager la ve como un mensaje).
- **Arregla en parte «logística asigna → runner»**: `hooks/useRunnerWarehouse.ts` enseña «mis solicitudes» con estado y botón de cancelar (cola `TRANSPORT cancel` + nueva política «Requester cancels own pending request»). Se refresca por REC, sin realtime.
- Añade `fleet_vehicles.type` (migración `20261022030000_runner_self_service.sql`, **ya aplicada en la BD local**). **No arregla el problema 12**: `FleetTab` sigue sin `onUpdateTractor` y no hay forma de rellenar `type` desde la app (el comentario de la migración dice «Logística lo rellena en Flota»). Ojo: `LogisticsWorkspace.tsx` no existe en esa rama (está en integración), así que al fusionar hay que comprobar que `FleetTab` del runner encaja con el `LogisticsWorkspace` de integración.
- No toca: el escaneo con nota fija «A» ni `QualityRatingModal` muerto, los bins sin cola offline, la falta de push, la lista de contactos del chat ni las reacciones, el micrófono y el responder.

**#71 fix/team-leader-review** (3 commits: el toque en picker abre el cajón de perfil, mapa táctico con las filas del equipo, correcciones en lote y alcance solo de equipo):
- **Arregla los problemas 7 y 8**: borra `PickerDetailsModal` y los `picker-details/*` (incluidos `QuickMessageView`, el guardado de estado bloqueado por el trigger y el «asignar filas» inalcanzable) y monta el `PickerDrawer` del manager en `pages/TeamLeader.tsx`.
- **Arregla en pantalla** el «TL asigna a todo el huerto»: `TasksView.tsx` usa `selectTeamOf` / `selectTeamRowAssignments` (`services/harvestMetrics/rowTeams.ts`). **En servidor no cambia nada**: la RLS de `row_assignments` sigue dejando al TL tocar cualquier equipo del huerto.
- `TimesheetEditor` recibe `pickerIds` (el TL solo carga su equipo) y añade `TimesheetBatchPanel` + `manage-attendance action=correct_batch` (hasta 200). El alcance de equipo es **solo de cliente**: `manage-attendance` correct/correct_batch siguen sin comprobar que el fichaje sea de su equipo (problema 13).
- **No arregla**:
  - `HomeView.tsx:57` `onNavigate('profile')`;
  - el pase de lista sin red (`AttendanceView` solo cambia una etiqueta: `<p>` por `<span>`);
  - la falta de botón de descanso;
  - que el TL no vea el rechazo de nómina (`TimesheetRow.tsx` de la rama no enseña `rejected_at` ni `rejection_reason`);
  - que el TL no vea inspecciones QC ni ausencias.
- Al fusionar #71: `components/modals/RowAssignmentModal.tsx` recibe `initialRow`. Comprobar que nadie más importa los `picker-details/*` borrados (en integración solo los usa `TeamView`).
