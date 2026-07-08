# harvestpro-nz — PWA AgTech para Nueva Zelanda

## Stack
React 19 + TypeScript (strict, no `any`, allowJs: false) + Vite 7 + Tailwind 3
Supabase (PostgreSQL, Edge Functions, RLS) + Capacitor 8 (Android)
State: Zustand (7 slices) + Dexie v3 (IndexedDB offline) + TanStack React Query
Validacion: Zod 4 | Monitoring: Sentry + PostHog (lazy) | i18n: 5 idiomas
Crypto: AES-256-GCM via Web Crypto API
Version: 9.9.0

## Comandos
- `npm test` — Vitest (4GB heap, jsdom, pool=forks, maxForks=2)
- `npm run build` — tsc + vite build
- `npm run lint` — ESLint (0 warnings max)
- `npm run lint:fix` — ESLint autofix
- `npm run format` — Prettier
- `npm run test:e2e` — Playwright
- `npm run test:rls` — Tests RLS contra Postgres real (skill /db-verify)
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
- `src/config/` — env validation, sentry, analytics, queryClient, crop-profiles, nz-tax-rates
- `src/context/` — AuthContext (session, refresh, MFA, privacy consent) + MessagingContext
- `src/utils/` — format (NZD), regionCheck (data sovereignty)
- `src/constants/` — nz-law.ts (compliance legal NZ)

### Supabase
- `supabase/migrations/` — 60 activas (+ archive/ historico). Verificar cambios RLS con `npm run test:rls` (skill /db-verify)
- `supabase/functions/` — 11 Edge Functions: approve-timesheet, calculate-payroll, check-compliance, detect-anomalies, manage-admin, manage-attendance, provision-orchard, record-bucket, send-push, submit-audit-log, api-v1
- `supabase/functions/_shared/` — cors.ts, security.ts (rate limit, Zod validation, CORS allowlist)
- `supabase/seeds/` — 6 seed files
- 30+ tablas con RLS, optimistic locking, soft deletes

### Offline
- Dexie IndexedDB con sync queue (10 tipos con processor)
- Encrypt-before-write con AES-256-GCM
- Dead letter queue para items fallidos
- Cross-tab mutex via Web Locks API
- Delta sync con 2-min buffer

### Tests
- 365 test files (Vitest + Testing Library + fake-indexeddb)
- ~3742 tests passing (14 files con failures por entorno CI)
- 20 E2E specs (Playwright) en tests/e2e/
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
- Husky en pre-commit ejecuta `npm run lint` (ver .husky/pre-commit)
- Verificacion completa antes de push: skill `/verify` (lint + test + build). Ver .claude/
- Codigo en ingles, comentarios en espanol
- Commits en ingles: tipo(scope): descripcion breve
- Ver SECURITY_RULES.md para reglas de seguridad obligatorias

## Variables de entorno (solo keys, NUNCA valores)
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (requeridas)
- VITE_SENTRY_DSN, VITE_POSTHOG_KEY, VITE_POSTHOG_HOST
- VITE_VAPID_PUBLIC_KEY, VITE_GEMINI_API_KEY
- VITE_APP_VERSION, VITE_ENABLE_ANALYTICS, VITE_LOG_LEVEL
- TEST_DEMO_PASSWORD, TEST_MANAGER_PASSWORD, TEST_ACID_PASSWORD, TEST_STRESS_PASSWORD (solo E2E)

## Roles del sistema
8 roles: admin, manager, team_leader, runner, qc_inspector, hr_admin, payroll_admin, logistics

## CI/CD
- 5 workflows en .github/workflows/: ci.yml, deploy-production.yml, deploy-staging.yml, security.yml, backup.yml
- CI: lint → test → build → deploy (Hetzner via SSH)
- Deploy production: test → build → Vercel
- Security: OWASP ZAP scan
- Tests en CI necesitan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY como env vars (placeholders OK)

## Estado actual (ver PROGRESS.md y ERRORES.md para detalle)
- Todos los P0 resueltos
- 5 TS errors bloqueantes resueltos (2026-03-29)
- Pendiente: tests de schemas Zod, routes.tsx, MFAGuard, indexes de DB
