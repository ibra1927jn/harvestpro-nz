# harvestpro-nz — PWA AgTech para Nueva Zelanda

## Stack
React 19 + TypeScript (strict, no `any`, allowJs: false) + Vite 7 + Tailwind 3
Supabase (PostgreSQL, Edge Functions, RLS) + Capacitor 8 (Android)
State: Zustand (7 slices) + Dexie v3 (IndexedDB offline) + TanStack React Query
Validacion: Zod 4 | Monitoring: Sentry + PostHog (lazy) | i18n: 3 idiomas (en, es, fr)
Crypto: AES-256-GCM via Web Crypto API
Version: 9.9.0

## Comandos
- `npm test` — Vitest (4GB heap, jsdom, pool=forks, maxForks=2)
- `npm run build` — tsc + vite build
- `npm run lint` — ESLint (0 warnings max)
- `npm run lint:fix` — ESLint autofix
- `npm run format` — Prettier
- `npm run test:e2e` — Playwright
- `npm run test:coverage` — Coverage (thresholds: 70/70/60/70)
- `npx cap sync && npx cap run android` — Build nativo Android

## Arquitectura (auditada 2026-03-28)

### Entry point
- `src/index.tsx` → Provider hierarchy: I18n > AppProvider > MFAGuard > Router
- `src/routes.tsx` → 10 lazy pages con ProtectedRoute por rol

### Capas
- `src/pages/` — 10 paginas: Login, OnboardingPage, Manager, TeamLeader, Runner, QualityControl, Admin, HHRR, LogisticsDept, Payroll
- `src/components/views/` — Vistas por dominio (manager/, hhrr/, logistics/, payroll/, qc/, runner/, team-leader/)
- `src/components/common/` — Shared: Header, BottomNav, messaging, setup-wizard, sync
- `src/components/modals/` — 25+ modales de CRUD
- `src/components/ui/` — Design system: Button, StatCard, FilterBar, VirtualList, Toast
- `src/services/` — Logica de negocio (40+ servicios): auth, sync, offline, gateway, payroll, compliance, crypto, OCR, push
- `src/repositories/` — 25+ repos especializados + baseRepository generico
- `src/stores/` — Zustand slices: settings, crew, bucket, intelligence, row, orchardMap, ui
- `src/hooks/` — 40+ custom hooks
- `src/schemas/` — Zod: zod.schemas.ts (boundary validation) + api.schemas.ts (Edge Function responses)
- `src/types/` — app.types.ts + database.types.ts (auto-gen) + result.ts (Result<T>)
- `src/config/` — env validation, sentry, analytics, queryClient, crop-profiles, mfa
- `src/context/` — AuthContext (estado + signIn/signOut/switchOrchard; el resto en `context/auth/`: lifecycle, keep-alive del token, registro con whitelist, modales re-auth/privacidad) + MessagingContext
- `src/utils/` — money (NZD), nzst (fechas/semanas NZ), csvParser, logger
- `src/constants/` — nz-law.ts (compliance legal NZ)

### Supabase
- `supabase/migrations/` — 90+ migraciones (las viejas en archive/ no se aplican)
- `supabase/functions/` — 12 Edge Functions: approve-timesheet, calculate-payroll, check-compliance, close-pay-week, detect-anomalies, manage-admin, manage-attendance, provision-orchard, record-bucket, send-push, submit-audit-log, api-v1 (api-v1 sin tabla api_keys todavía)
- Push: triggers → `notification_outbox` → `send-push` (flush) → `public/sw-push.js`; ver `docs/push-notifications.md`
- `supabase/functions/_shared/` — pay-rules.ts (idéntico a src/services/harvestMetrics/pay.ts, lo vigila pay-parity.test.ts), payroll-calc.ts, security.ts, scan-time.ts, cors.ts
- `supabase/seeds/` — seeds locales (orden: seed_00_local_bootstrap → seed_2weeks_local → seed_role_users)
- 35 tablas, RLS en todas, 2FA (aal2) exigido por política para roles privilegiados
- Fichajes (`daily_attendance`) y cubetas (`bucket_records`): el manager SOLO los de su huerto, también de quien
  rota (parte del día aquí y parte en otro); admin, RRHH y nómina, toda la empresa; el TL los fichajes de su equipo
  (también en otro huerto) y de gente sin equipo del huerto, y las cubetas de su huerto y de su equipo; cada uno lo
  suyo; las cubetas del huerto las ve todo el huerto. Runner, QC y logística saben quién está fichado con
  `presence_today(huerto)` (sin horas ni pago; el store la relee cada minuto, migración 20261024021000); el manager
  sabe por ella quién está ahora en otro huerto (solo el nombre). Lo que necesita el día entero de quien rota va por
  el servidor: `calculate-payroll` y `check-compliance` leen fichajes y cubetas con service role y devuelven la
  parte del huerto (las horas de la hoja de fichajes salen de ahí); el historial del picker pone «—» en el pago de
  un día partido (`picker_days_elsewhere`, solo fechas). `presence_today` de otro huerto y la auditoría de fichajes,
  cubetas y precios de otro huerto: no para el manager (migraciones 20261027070000 y 20261027071000).
- Ausencias (`leave_requests`): manager del huerto, RRHH, nómina y admin de la empresa, el TL SOLO las de su
  equipo (y las pide para su equipo) y cada uno las suyas; runner, QC y logística ven «de permiso» con
  `presence_today` (migración 20261027040000_team_scoped_leave_qc_rows).
- Calidad (`qc_inspections`, con las respuestas de bienestar, y las fotos de `qc-photos`): manager del huerto,
  RRHH y admin de la empresa, el TL solo las de pickers de SU equipo y el inspector de QC solo las que creó él
  (crea; no cambia ni borra). Runner, logística y nómina, nada. La foto del TL se busca por
  `qc_inspections.photo_url` (misma migración).
- Precios por cubeta (`piece_rates`, `variety_rates`, `harvest_settings.piece_rate`, `day_setups.piece_rate`): cada
  uno lee solo los de SU huerto (manager, TL, runner, QC, logística); admin, RRHH y nómina los de todos. La escritura
  no cambia (manager de su huerto y admin). Lo que paga el día entero de alguien con precios de otro huerto va por el
  servidor: `calculate-payroll` y `check-compliance` leen precios con service role (`_shared/rates-client.ts`), la hoja
  diaria del manager toma el complemento de `calculate-payroll` y el historial del picker pone «—» si no ve el precio
  (migración 20261027050000).
- Nómina (`/payroll`): el manager ve solo la parte de SU huerto; RRHH, nómina y admin, la empresa.
  `calculate-payroll` le da su huerto aunque pida la empresa (otro huerto: 403) y cada día sale reducido a ese
  huerto (`_shared/payroll-orchard.ts`: sus tramos, cubetas y líneas de precio, y su parte de horas, complemento
  y pago; el complemento se calcula con el día entero). La foto de una semana cerrada, igual; `pay_weeks` solo la
  leen admin, nómina y RRHH (migración 20261027060000). El manager no exporta (Xero/PaySauce es la paga entera de
  cada persona) ni cierra la semana. `check-compliance`: manager y TL solo su huerto, la paga como su parte.
- Filas (`row_assignments`): las crea, reasigna y retira el manager (o admin), también varias por delante; el TL
  solo mueve a SU equipo (`pickers.current_row`, `moveTeamToRow`) entre las filas activas asignadas a su equipo y
  apunta avance y fin (triggers `guard_team_leader_current_row` y `guard_row_assignment_team_leader`).
- Hora de fichajes y cubetas: la del servidor; la del móvil solo desde la cola sin red, corregida con el
  desfase medido y nunca del futuro (`_shared/device-time.ts`, `_shared/scan-time.ts`; el desfase queda en
  `*_clock_skew_ms`). Tramos de más de 14 h sin corregir: se pagan 14 h y no se aprueban
  (`PAY_RULES.maxUnreviewedShiftHours`, trigger `trg_require_long_shift_correction`).

### Offline
- Dexie IndexedDB con sync queue (13 tipos con processor; LEAVE_REQUEST: ausencias que pide el team leader sin red;
  BIN: alta y estado de bins del runner sin red; CHAT_REACTION: reacciones del chat sin red; ATTENDANCE: pase de
  lista y descansos sin red vía `rollCall.service`, con id del tramo y hora del móvil; un rechazo 4xx del servidor
  va directo a la DLQ con su motivo)
- Chat en vivo: un canal privado por conversación abierta, `chat:<id>` (RLS en realtime.messages, migración
  20261023070000): mensajes nuevos, reacciones (Broadcast desde la base) y «Escribiendo…» (Broadcast, sin tabla)
- Archivos sin red (adjuntos y notas de voz del chat, fotos de QC): tabla `pending_files`, cifrados, tope 50 MB
  (`services/pending-uploads.service.ts`); salen con la bandeja del chat / la cola QC_INSPECTION
- Encrypt-before-write con AES-256-GCM
- Dead letter queue para items fallidos
- Cross-tab mutex via Web Locks API
- Delta sync con 2-min buffer

### Tests
- ~470 archivos de test Vitest en src/ (Testing Library + fake-indexeddb). Nunca la suite entera en local:
  `npx vitest run <archivos> --pool=forks --maxWorkers=1` (Vitest 4: `--poolOptions` ya no existe).
- TZ fija `Pacific/Auckland`, puesta en vitest.config*.ts antes de crear los workers.
- Config local: threads, 2 workers. CI (vitest.config.ci.ts): forks, 1 worker, 5 shards.
- Guards baratos (CI): `npm run test:assertions` (tests que no pueden fallar, incluye src/integration)
  y `npm run test:mock-guard` (vi.mock que el setup dejaría sin efecto).
- `npm test` funciona en un clon limpio sin `.env`: `src/test-env.ts` pone URL/clave de Supabase falsas
  si faltan. Los que usan el Supabase local real (`tests/integration/`, `src/integration/*supabase*` y
  `role-flows-sanity`, lista `INTEGRATION_TESTS` en vitest.config.ts) van aparte: `npm run test:integration`
  (necesita `supabase start`; los de src/integration se saltan sin SUPABASE_SERVICE_ROLE_KEY).
- Edge Functions: `npm run test:functions` (Deno, supabase/functions/tests/, necesita .env.local).
- BD: `scripts/test-db-security.sh` (RLS, SECURITY DEFINER; supabase/tests/security/*.sql con ROLLBACK).
  Tabla nueva en `public`: añadirla a `99_rls_matrix.sql` (quién lee/crea/cambia/borra, rol por rol) o falla.
- E2E Playwright: ~31 specs en e2e/ (`npm run test:e2e`) y 9 móviles en e2e/mobile
  (`npm run test:e2e:mobile`, puerto 3000 o `MOBILE_PORT`; reutiliza un servidor ya levantado).
- «Empresa desde cero»: `npm run test:e2e:fresh` (playwright.fresh.config.ts, e2e/fresh-company.spec.ts):
  alta del primer admin → temporada, bloques y filas → invitaciones → registro de manager/TL/runner →
  fichaje → cubeta → el manager la ve. Base vacía (CI): alta real por /signup. Base con la demo: crea un
  huerto aparte con la clave de servicio y al final borra solo lo suyo (`E2E_FRESH_KEEP=1` lo deja).
  Necesita psql (`DB_URL`), 2FA apagado (VITE_MFA_ENFORCE=false + scripts/dev-disable-mfa.sql; en local
  se salta, en la CI falla) y `E2E_BASE_URL` / `PW_CHROMIUM_PATH` opcionales. Al borrar comprueba que no
  quedan filas huérfanas.
- `npm run perf:budget` tras `vite build`: tamaño inicial por ruta, chunks prohibidos, precache SW.
- Storybook para componentes UI

## Reglas del proyecto
- TypeScript strict: NUNCA usar `any`, siempre tipar explicitamente
- Path alias: `@/*` = `./src/*`
- Imports lazy para paginas (React.lazy + Suspense)
- PWA offline-first: toda operacion debe funcionar sin conexion
- Tests con fake-indexeddb para simular Dexie
- Supabase RLS activo: NUNCA bypass de seguridad a nivel de row
- NUNCA modificar migraciones existentes, solo crear nuevas
- .env y .env.local NUNCA se commitean (hay .env.example como referencia)
- Husky pre-commit: solo `npm run lint` (los tests van en CI)
- Codigo en ingles, comentarios en espanol
- Commits en ingles: tipo(scope): descripcion breve
- Ver SECURITY_RULES.md para reglas de seguridad obligatorias
- Consultas que pueden pasar de 1000 filas (cubetas, fichajes de varios días, chat, auditoría): SIEMPRE
  `fetchAllRows` con orden estable (`.order('id')`); PostgREST corta en 1000 sin avisar. Listas de ids
  en `.in()` de más de ~100: `fetchInChunks` (con 200+ UUIDs la URL da 414). En Edge Functions:
  `_shared/fetch-all-rows.ts` y `_shared/fetch-in-chunks.ts`.
- Políticas RLS nuevas: las funciones de rol van envueltas, `(SELECT get_my_orchard_id())`,
  `(SELECT is_role(ARRAY['manager']))`, `(SELECT auth.uid())`: sin el SELECT se ejecutan por cada fila
  (migración 20261021000100_rls_initplan: la nómina pasó de 18 s a 0,4 s).

## Prueba de carga (scripts/loadsim)
- Simula una empresa (3 huertos, 240 pickers, 31 móviles) contra el Supabase local: un día en vivo por
  roles (`live-day.mjs`, reloj acelerado), N días de histórico en bloque (`history.sh`) y las operaciones
  de oficina con ese volumen (`period-ops.mjs`). `run-scenario.sh <nombre> <dias> current|optimized`.
- `use-variant.sh` cambia las Edge Functions y migraciones a las de main (current) o a las de la rama.
- Resultados y comparación: `scripts/loadsim/results/`, informe en `docs/audits/2026-10-21-load-test.md`.

## Variables de entorno (solo keys, NUNCA valores)
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (requeridas)
- VITE_SENTRY_DSN, VITE_POSTHOG_KEY, VITE_POSTHOG_HOST
- VITE_VAPID_PUBLIC_KEY, VITE_MFA_ENFORCE (solo dev)
- VITE_APP_VERSION, VITE_ENABLE_ANALYTICS, VITE_LOG_LEVEL
- TEST_DEMO_PASSWORD, TEST_MANAGER_PASSWORD, TEST_ACID_PASSWORD, TEST_STRESS_PASSWORD (solo E2E)

## Roles del sistema
8 roles: admin, manager, team_leader, runner, qc_inspector, hr_admin, payroll_admin, logistics

## CI/CD
- 2 workflows en .github/workflows/: ci.yml, security.yml
- CI: lint → test (5 shards) → build. Sin despliegue automático. Solo corre en `pull_request` (y push a main).
- Trabajos con Supabase local real (`supabase start` en el runner, CLI 2.120.0, vía `scripts/ci/local-stack.sh start`:
  migraciones + seeds `seed_00_local_bootstrap`, `seed_2weeks_local`, `seed_role_users`, `seed_today_local`, claves
  VAPID de prueba en `supabase/functions/.env` y `.env.local` con las claves locales):
  - `edge-functions`: tests Deno de `supabase/functions/tests/` contra las funciones del checkout, copia y
    restauración con `backup-local.sh` y `backup-local.ps1` (pwsh), y recuperación completa en una base vacía.
  - `e2e`: `npm run test:e2e:smoke` (suite móvil, Pixel 7: login de los 8 roles con 2FA real, cubeta del runner
    con y sin red, nota de QC, equipo del TL, aprobar/rechazar de nómina; build real + `vite preview` en :3000), y
    `npm run test:e2e:fresh` («empresa desde cero») tras `local-stack.sh reset` + `disable-mfa` y con
    `VITE_MFA_ENFORCE=false`; si el spec `e2e/fresh-company.spec.ts` no está en la rama, aviso y se salta; si está
    y falta el script, falla.
  - Los tests Deno van al runtime de funciones directo (`FUNCTIONS_URL` en `.env.local`): por kong el CORS no se
    puede comprobar y en la CI eso es un fallo.
  - `android-apk`: `vite build` + `cap sync android` + `gradlew assembleDebug` (JDK 21); APK sin firmar como artefacto.
- En local (con tu Supabase ya levantado y `.env.local`; NO uses `local-stack.sh`, es para máquinas vacías):
  `npm run test:functions`, `npm run test:e2e:smoke` (reutiliza un servidor en :3000 si lo hay),
  `cd android && ./gradlew assembleDebug` tras `npx vite build && npx cap sync android`.
- Entorno real: Supabase local en Docker (`supabase start`) + `npm run dev`. Los deploys a Hetzner y Vercel se retiraron el 2026-10-10.
- Seeds para local, en orden: seed_00_local_bootstrap → seed_2weeks_local → seed_role_users
- Security: OWASP ZAP scan
- Tests en CI necesitan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY como env vars (placeholders OK)

## Copias de seguridad locales
- `scripts/backup-local.ps1` (Windows) / `scripts/backup-local.sh`: lanzan `scripts/backup/container-dump.sh` dentro
  del contenedor (`pg_dump --snapshot` con recuentos, huérfanas y migraciones en la misma instantánea), copian
  Storage y secretos (Vault, `.env.local`, `supabase/functions/.env`) a una carpeta con fecha y guardan las 14
  últimas. Copia sospechosa (base vacía o tabla clave a menos de la mitad) → `.suspect`, sin rotar, código 2.
  `-MirrorDir` / `MIRROR_DIR`: segunda copia en otro disco.
- `scripts/restore-local.(ps1|sh)` (`scripts/backup/container-restore.sh`): por defecto restaura en una base aparte
  (`harvestpro_restore_check`), compara recuentos y avisa de huérfanas; `-FreshStack` / `--fresh-stack` carga la
  copia en un Supabase nuevo y vacío (si la copia es de un esquema anterior: `db reset --version`, datos y
  `migration up`).
- `seed_season_simulation.sql` desactiva `trg_push_qc_inspection` mientras mete sus inspecciones (sin push).
- Programarlo cada día con el Programador de tareas: `docs/backups-local.md`.

## Estado actual (2026-10-27)
- `main` se quedó en el 2026-10-19; el PR de integración de `integracion/fase-0` (Fase 0 de `docs/PLAN_NIVEL.md`)
  lo pone al día hasta el 2026-10-27, cuando Ibra lo revise y lo fusione. Trabajo nuevo: ramas cortas que se
  fusionan en 1–2 días, nunca apiladas.
- Plan en curso: `docs/PLAN_NIVEL.md` (nada nuevo fuera de él). Resumen corto del estado: `PROGRESS.md`.
- Sin usuarios reales todavía. Una instalación = una empresa con varios huertos.
- Auditorías: externa `docs/audits/2026-10-16-external-audit.md`, botones y flujos
  `docs/audits/2026-10-23-wiring-audit.md`, ramas `docs/audits/2026-10-27-inventario-ramas.md`.
- Datos personales: nada de email, IRD, cuenta bancaria ni `picker_id` en claro a Sentry o PostHog; todo lo que
  salga pasa por `src/utils/piiScrub.ts` (`beforeSend`/`beforeBreadcrumb` en `config/sentry.ts`, `config/analytics.ts`).
- Estructura del huerto (temporadas, bloques, filas): pantalla `components/views/orchard-structure/`
  (Admin › Orchard setup, cualquier huerto; Manager › Orchard setup, el suyo). Migración
  20261024010000: sin DELETE (se archiva), número de fila único por temporada, totales de bloque y huerto
  automáticos, `activate_harvest_season` / `close_harvest_season` / `copy_season_structure` /
  `add_block_rows`; el asistente de huerto nuevo (`setup_orchard_atomic`) crea temporada, bloques y filas.
  20261024011000: la variedad de la cubeta sale de la fila de la temporada ACTIVA; `create_harvest_season`
  (copiar + activar) y `create_orchard_block` (con filas) en una transacción; candado por temporada al meter
  filas. Los bloques pueden tener huecos: las filas reales son `blockRowNumbers()` (utils/blockRows.ts),
  nunca start_row..start_row+total_rows.
- Reglas de equipos: el team leader solo gestiona su equipo y puede coger a gente sin equipo; mover, soltar, dar de baja o borrar es de RRHH/admin; el manager asigna filas a los equipos y el TL mueve a su equipo solo entre ellas (migraciones 20261016000000_picker_team_rules y 20261027040000).
- Nómina: ninguna hora se paga sin revisar: `close-pay-week` no cierra la semana con tramos sin aprobar,
  rechazados o de más de 14 h sin corregir (`unreviewedShifts` en pay.ts).
- Nómina: la app calcula bruto y horas y exporta a Xero/PaySauce. El 8% de holiday pay de casuales, PAYE, KiwiSaver, ACC y las nóminas los hace el programa de nóminas (decisión del dueño, 2026-10-16).
- Salario mínimo: tabla con fechas `NZ_MIN_WAGE_HISTORY` en src/services/harvestMetrics/pay.ts (copiar igual a supabase/functions/_shared/pay-rules.ts). Cada año, cuando se publique el Minimum Wage Order, añadir la fila con fecha 1 de abril. No volver a escribir 23.95 a mano: usar `PAY_RULES.minWageFloor` o `minWageFloorOn(fecha)`.
- Documentación histórica (auditorías de abril, guías de Hetzner/Vercel/Supabase Cloud): `docs/archive/2026-04/`.
