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
- `supabase/migrations/` — 90 migraciones (las viejas en archive/ no se aplican)
- `supabase/functions/` — 12 Edge Functions: approve-timesheet, calculate-payroll, check-compliance, close-pay-week, detect-anomalies, manage-admin, manage-attendance, provision-orchard, record-bucket, send-push, submit-audit-log, api-v1 (api-v1 sin tabla api_keys todavía)
- Push: triggers → `notification_outbox` → `send-push` (flush) → `public/sw-push.js`; ver `docs/push-notifications.md`
- `supabase/functions/_shared/` — pay-rules.ts (idéntico a src/services/harvestMetrics/pay.ts, lo vigila pay-parity.test.ts), payroll-calc.ts, security.ts, scan-time.ts, cors.ts
- `supabase/seeds/` — seeds locales (orden: seed_00_local_bootstrap → seed_2weeks_local → seed_role_users)
- 35 tablas, RLS en todas, 2FA (aal2) exigido por política para roles privilegiados

### Offline
- Dexie IndexedDB con sync queue (12 tipos con processor; LEAVE_REQUEST: ausencias que pide el team leader sin red;
  BIN: alta y estado de bins del runner sin red; ATTENDANCE: pase de lista y descansos sin red vía
  `rollCall.service`, con id del tramo y hora del móvil; un rechazo 4xx del servidor va directo a la DLQ con su motivo)
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
- `src/integration/*supabase*` y `role-flows-sanity` usan el Supabase local real (se saltan sin
  SUPABASE_SERVICE_ROLE_KEY).
- Edge Functions: `npm run test:functions` (Deno, supabase/functions/tests/, necesita .env.local).
- BD: `scripts/test-db-security.sh` (RLS, SECURITY DEFINER; supabase/tests/security/*.sql con ROLLBACK).
- E2E Playwright: ~31 specs en e2e/ (`npm run test:e2e`) y 9 móviles en e2e/mobile
  (`npm run test:e2e:mobile`, puerto 3000 o `MOBILE_PORT`; reutiliza un servidor ya levantado).
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
- CI: lint → test (5 shards) → build. Sin despliegue automático.
- Entorno real: Supabase local en Docker (`supabase start`) + `npm run dev`. Los deploys a Hetzner y Vercel se retiraron el 2026-10-10.
- Seeds para local, en orden: seed_00_local_bootstrap → seed_2weeks_local → seed_role_users
- Security: OWASP ZAP scan
- Tests en CI necesitan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY como env vars (placeholders OK)

## Estado actual (2026-10-16)
- `main` al día (antes la pila de ramas iba 254 commits por delante). Trabajo nuevo: ramas cortas que se fusionan en 1–2 días, nunca apiladas.
- Sin usuarios reales todavía. Una instalación = una empresa con varios huertos.
- Auditoría externa y pendientes: `docs/audits/2026-10-16-external-audit.md`.
- Reglas de equipos: el team leader solo gestiona su equipo y puede coger a gente sin equipo; mover, soltar, dar de baja o borrar es de RRHH/admin; el manager mueve equipos de fila (migración 20261016000000_picker_team_rules).
- Nómina: la app calcula bruto y horas y exporta a Xero/PaySauce. El 8% de holiday pay de casuales, PAYE, KiwiSaver, ACC y las nóminas los hace el programa de nóminas (decisión del dueño, 2026-10-16).
- Salario mínimo: tabla con fechas `NZ_MIN_WAGE_HISTORY` en src/services/harvestMetrics/pay.ts (copiar igual a supabase/functions/_shared/pay-rules.ts). Cada año, cuando se publique el Minimum Wage Order, añadir la fila con fecha 1 de abril. No volver a escribir 23.95 a mano: usar `PAY_RULES.minWageFloor` o `minWageFloorOn(fecha)`.
- Documentación histórica (auditorías de abril, guías de Hetzner/Vercel/Supabase Cloud): `docs/archive/2026-04/`.
