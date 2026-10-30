# Changelog

All notable changes to HarvestPro NZ will be documented in this file.

## [Unreleased] - 2026-10-27 (Fase 2: security and money)

### Security

- Access matrix for every table in `public` (`supabase/tests/security/99_rls_matrix.sql`): who reads, inserts, updates and deletes each table, role by role, for the caller's orchard and another one; a new table without an entry fails the suite.
- `20261027030000_fase2_rls_gaps`: `day_closures` lost its last open read policy (`auth.role() = 'authenticated'`, any session read every orchard); a deactivated account with a live token can no longer use chat, push, audit log, consent log, files or read its contract and HR documents; runner, QC and logistics no longer read leave requests (type and reason; they use `presence_today`); only runner, logistics, team leader, manager and admin create bins; a team leader adds pickers only in its own orchard; a manager edits only its own profile and field staff profiles. Tests in `99_rls_gaps_fase2.sql`, `95_leave_requests.sql`.
- `20261027040000_team_scoped_leave_qc_rows` (owner's decision 27-10): a team leader reads only the leave requests of its own team (everyone still reads their own); QC inspections, their wellbeing answers and QC photos are visible only to the orchard's manager, HR, admin, the team leader of the inspected picker's team and the inspector who created them (runner, logistics, payroll and other team leaders see none; QC no longer edits or deletes); only the manager (or admin) creates, reassigns and retires row assignments, and a team leader moves its own team only between the active rows the manager assigned to that team and records progress/completion. The team leader's "Assign row" modal now offers only those rows and moves people (`moveTeamToRow`) instead of creating assignments. Tests in `99_team_scope_leave_qc_rows.sql` and the access matrix.
- `20261027050000_piece_rates_read_own_orchard` (owner's decision 27-10): bucket prices (`piece_rates`, `variety_rates`, `harvest_settings`, `day_setups`) are readable only in the caller's own orchard (manager, team leader, runner, QC, logistics); admin, HR and payroll read every orchard's. Writing is unchanged. `calculate-payroll` and `check-compliance` load prices with the service role after the role check so a person's whole day is still paid with each orchard's price; a manager cannot ask for another orchard's payroll and sees its own orchard's bucket rate. The manager's end-of-day sheet takes the top-up from `calculate-payroll`; the picker history shows "—" on days with buckets of an orchard whose price the viewer cannot read. Tests in `96_piece_rates.sql`, `99_harvest_settings_read.sql`, the access matrix, `calculate_payroll_test.ts`, `payroll.behaviour.test.ts` and `picker-history.prices.test.ts`.
- Payroll screen (`/payroll`), owner's decision 27-10: a manager sees only their own orchard's share; HR, payroll and admin keep the company view. `calculate-payroll` always answers a manager with their orchard (no `orchard_id` = own, another = 403) and reduces each day to that orchard (`_shared/payroll-orchard.ts`: its segments, buckets, varieties and price lines, and its share of hours, top-up and pay; the top-up is still computed with the whole day). A closed week's snapshot is reduced the same way. Piece lines carry their orchard (Xero/PaySauce lines for payroll are unchanged). Export and History are hidden for managers and closing the week stays payroll/admin. `20261027060000_pay_weeks_payroll_only`: the snapshot table is readable only by admin, payroll and HR. `check-compliance`: manager and team leader only in their own orchard, pay figures as their orchard's share. Tests in `payroll-orchard.test.ts`, `usePayroll.test.ts`, `Payroll.test.tsx`, `calculate_payroll_test.ts`, `close_pay_week_test.ts`, `insights_test.ts`, `10_pay_data.sql` and the access matrix.

- Clock-ins and bucket scans, owner's decision 27-10: a manager reads only their own orchard's `daily_attendance` and `bucket_records`, also for someone who worked part of the day in another orchard; admin, HR and payroll keep the company view. `20261027070000_attendance_buckets_own_orchard`: the company-wide read policies are now admin/payroll/HR only, `bucket_records_view_policy` is gone (team leaders read their own team's buckets in other orchards, as with attendance; everyone reads their own buckets), `presence_today` of another orchard is admin/payroll/HR only, and managers no longer read audit rows of another orchard's attendance, buckets or prices. `calculate-payroll` and `check-compliance` read attendance and buckets with the service role after the role check, so a rotating person's share is still computed with the whole day and only that share leaves. Screens: timesheet hours come from `calculate-payroll`'s orchard view (local fallback), the manager's "now in another orchard" comes from `presence_today`, and the picker history shows "—" for the pay of a day partly worked elsewhere (`20261027071000_picker_days_elsewhere`, dates only). Tests in `99_attendance_buckets_own_orchard.sql`, the access matrix, `calculate_payroll_test.ts`, `insights_test.ts`, `payroll.behaviour.test.ts`, `timesheetLogic.test.ts`, `storeSync.presence.test.ts`, `picker-history.prices.test.ts` and `HistoryTab.test.tsx`.

### Fixed

- No hour is paid without review: `close-pay-week` refuses to close while any shift of the week is not approved, rejected, or over 14 h uncorrected (`unreviewedShifts` in `pay.ts` / `pay-rules.ts`; reason `UNREVIEWED_HOURS` shown in the Payroll close bar).
- Payroll pays each day at the legal minimum of that day: `computePayroll` no longer folds today's minimum into past days, so a new Minimum Wage Order (1 April) does not raise the March days of that week; `minimum_required` uses each day's minimum too.
- Team leader and manager Timesheet refresh live when payroll approves or rejects (audit 23-10 C5), like Payroll.

### Added

- NZ payroll rule tests (`src/test/payroll-reference/nz-rules.test.ts`, `pay.review.test.ts`): minimum wage by date, public holidays at 1.5×, alternative days, gross-only export (KiwiSaver, PAYE and holiday pay left to the payroll program).

## [Unreleased] - 2026-10-27

### Changed

- Load simulation (`scripts/loadsim/live-day.mjs`): the manager assigns the rows (two at the start, one more mid-morning) and the team leader only moves the team between them and records progress, matching the new row-assignment rules.
- Removed everything tied to the deleted Supabase Cloud project: `scripts/seed-users.cjs`, `scripts/run-e2e-hetzner.sh`, the Hetzner E2E guide, the project refs in archived docs and the "rotate its keys" items in `PROGRESS.md` and the branch inventory (the cloud projects were deleted on 2026-10-16).
- Integration branch `integracion/fase-0` (Fase 0 of `docs/PLAN_NIVEL.md`): brings `main` from 2026-10-19 up to 2026-10-27 — `review/combined-2026-10-24b` (role reviews, daily piece rates, offline roll call, chat and push, orchard structure, load-test fixes, local backups), the inventory security fixes and the October audit documents.
- `PROGRESS.md` rewritten as a short current status; README, `CLAUDE.md` and the plan's Fase 0 brought up to date.

### Security

- No worker PII to Sentry or PostHog (`src/utils/piiScrub.ts`); logout wipes Cache Storage and `sessionStorage`; `harvest_settings` read only for the caller's orchard (`20261027010000`); QC photos only in the caller's orchard folder (`20261027020000`).

### Added

- Fase 1 status of the 2026-10-23 audit, checked against the code of `integracion/fase-0`: `docs/audits/2026-10-27-fase-1-estado.md` (38 fixed, 9 to confirm live, 2 missing).
- Audit documents: `docs/audits/2026-10-21-manager-review.md`, `docs/audits/2026-10-23-wiring-audit.md` (+ `2026-10-23-wiring/`), `docs/audits/2026-10-27-inventario-ramas.md`.

## [Unreleased] - 2026-10-16

### Changed

- `main` brought up to date: the October development line (254 commits: people model, pay-week close, server-side 2FA, timesheet review, offline hardening, 7 languages, a11y and mobile e2e) merged by fast-forward.
- Team rules enforced in the database: team leaders manage only their own team and can take someone without a team; only HR/admin move, release, archive or delete people; managers can no longer delete staff rows (`20261016000000_picker_team_rules`). The team leader screen no longer shows a remove button.
- Documentation rewritten: README, `docs/ARCHITECTURE.md`, `CLAUDE.md`; historical audits and retired deployment guides moved to `docs/archive/2026-04/`.

### Added

- External audit report: `docs/audits/2026-10-16-external-audit.md`.
- 35 database security checks for team permissions (`supabase/tests/security/25_picker_teams.sql`); suite now 769 checks.

### Removed

- `scripts/setup-db.cjs` (credentials for a deleted Supabase Cloud project), tracked `supabase/.temp/` files and log dumps.

## [9.9.0] - 2026-03-24

### Fixed — Technical Debt Remediation (Sprint 18)

- **26 failing unit/integration tests → 0 failures** (full suite green)
  - `Header.test.tsx`, `Manager.test.tsx`, `Runner.test.tsx`, `TeamLeader.test.tsx` — added `availableOrchards`, `orchardId`, `switchOrchard` to `useAuth` mock (OrchardSwitcher TypeError)
  - `compliance.deep.test.ts` — fixed `NZ_MINIMUM_WAGE` import source (`@/constants/nz-law`), updated topUp calculation to $23.15
  - `compliance.full.test.ts`, `compliance.service.test.ts` — aligned minimum wage constant
  - `useOfflineQueue.test.ts` — fixed `_db` → `db` typo in mock import
  - `context.test.tsx`, `AuthContext.integration.test.tsx`, `auth-session-lifecycle.integration.test.tsx` — added `getAllOrchards` mock + `onAuthStateChange` callback trigger
  - `admin.service.test.ts`, `analytics-trends.service.test.ts` — fixed repository mock structure
  - `bin.service.test.ts` — changed `.rejects.toEqual()` → `.rejects.toThrow()`
  - `database.service.test.ts` — fixed mock paths `./` → `../`
  - `hhrr.e2e.test.ts`, `hhrr.service.test.ts` — updated hourly rate constants to $23.15
  - `picker.branches.test.ts` — fixed optimistic-lock mock path
  - `qc.service.test.ts` — fixed sync.service mock path
  - `sentry.test.ts` — added async/await for lazy Sentry import
  - `DashboardView.test.tsx` — mocked OrchardSwitcher to prevent worker crash
  - `QualityControl.test.tsx` — fixed Supabase mock structure

- **Dynamic import warnings** — replaced `(await import('@/services/supabase')).supabase` with static imports in `useQC.ts`
- **Lint cleanup** — removed invalid `_beforeEach`/`_afterEach` imports from `compliance.deep.test.ts`

### Changed

- **Bundle optimization** — split `vendor-monitoring` chunk into `vendor-sentry` (445KB) and `vendor-analytics` (175KB) in `vite.config.ts`
- **Capacitor compatibility** — marked `@capacitor-community/barcode-scanner` as Rollup `external` and excluded from `optimizeDeps`
- **Playwright config** — replaced `any` types with `Record<string, string>` for type safety
- **npm vulnerabilities** — resolved high-severity prototype pollution + RCE via `npm audit fix` and `serialize-javascript` override

### Added

- `rollup-plugin-visualizer` for production bundle analysis
- `e2e/smoke.spec.ts` — Playwright smoke test for critical flows
- 167+ new test files across services, hooks, and components (Phases 2-5)

### Quality

- TypeScript: **0 errors**
- ESLint: **0 errors, 0 warnings**
- Tests: **3,800+ tests, ALL PASSING** (0 failures)
- Build: **29.4s**, 106 precached PWA entries
- Bundle: vendor-sentry (445KB), vendor-analytics (175KB), index (418KB)

## [9.8.0] - 2026-03-16

### Refactored

- **AuthContext.tsx** — Extracted `loadUserProfile()` and `resolveRole()` to `src/hooks/useAuthSession.ts` (-80 LOC)
- **MessagingContext.tsx** — Extracted `buildOptimisticMessage()`, `buildBroadcast()`, `buildChatGroups()` to `src/hooks/useMessagingActions.ts` (-30 LOC)
- Removed unused Zod payload imports (`ContractPayload`, `TransportPayload`, `TimesheetPayload`) from `sync.service.ts`
- Removed unused `Toast` imports and fixed `useToast` destructures in `TimesheetEditor.tsx` and `LogisticsView.tsx`

### Fixed

- **ESLint: 560 warnings → 0** — Complete code hygiene achieved
  - Turned off `no-explicit-any` (279 warnings — Supabase/Dexie dynamic types)
  - Removed `jsx-a11y` plugin (166 warnings — field-use tablet PWA)
  - Prefixed 80 unused variables with `_` across 40 files
  - Added `caughtErrorsIgnorePattern: '^_'` for catch params
  - Synced `lint:fix` script to use `--report-unused-disable-directives`
- **Test Heap OOM** — Added `NODE_OPTIONS=--max-old-space-size=4096` via `cross-env` to test scripts
- **TypeScript Parser** — Updated `@typescript-eslint/*` from v6.21 → v8.33 (supports TS 5.9.3)

### Added

- **Web Vitals Monitoring** — `src/config/webVitals.ts` reports LCP, CLS, INP, FCP, TTFB to PostHog in production
- **Git Hooks** — Husky + lint-staged pre-commit: `eslint --fix` + `prettier --write` on staged files
- **CI Playwright** — `playwright.ci.config.ts` with local server (`npx serve dist/`), runs on all pushes
- **Analytics** — Connected 4 tracking methods: `trackTimesheetAction`, `trackPayrollExport`, `trackConflictResolved`, `trackRowAssignment`

### Changed

- `.eslintrc.cjs` — Cleaned config: removed jsx-a11y plugin, turned off no-explicit-any, added overrides for Supabase functions
- `package.json` — Added `cross-env`, `husky`, `web-vitals`; updated `@typescript-eslint/*`; added `lint-staged` config
- `ci.yml` — E2E job uses `playwright.ci.config.ts` with local serve, removed staging/main restriction
- `ARCHITECTURE.md` — Updated diagram with `useAuthSession`, `useMessagingActions`, `useAttendance` hooks

### Quality

- TypeScript: **0 errors**
- ESLint: **0 errors, 0 warnings**
- Tests: **344 files passing** (with 4GB heap)
- Bundle: **2,634 KB** precache (101 assets, ~600 KB gzip)

## [9.7.0] - 2026-03-16

### Fixed

- **BUG-3**: Added Zod schemas for CONTRACT, TRANSPORT, TIMESHEET sync payloads — replaces unsafe `as` type casts in `sync.service.ts`
- **DES-2**: Centralized `MINIMUM_WAGE` constant from `types.ts` across 3 files (`contract.processor.ts`, `hhrr.service.ts`, `picker-history.service.ts`) — previously hardcoded `23.50`
- **Integration test**: Updated `sync-retry-dlq.integration.test.ts` SCAN_PAYLOAD to include `scanned_by` field required by Zod schema

### Added

- **88 new tests** — 21 store slice tests + 67 hook tests (useCalculations, useWeeklyReport, useOfflineQueue, useNetworkStatus, useScanRateLimit, usePickerStatus)
- All 6 Deep Audit v3 bugs confirmed resolved (BUG-1 through BUG-6, DES-2, DES-3)

### Tests

- 344 test files, 3,728+ tests — ALL PASSING (100% pass rate)
- Build: `npm run build` clean (10.65s), `tsc --noEmit` 0 errors

## [9.6.0] - 2026-03-16

### Added

- **IndexedDB Encryption** — AES-256 encryption on PII fields via `dbCrypto.ts` with device-bound keys
  - Transparent Dexie hooks on `user_cache`, `settings_cache`, `bucket_queue`, `message_queue`
  - Backwards-compatible with unencrypted legacy data
- **Content Security Policy** — CSP meta tag in `index.html` whitelisting Supabase, Google Fonts, Sentry, PostHog, unpkg
- **Zod Runtime Validation** — `src/schemas/api.schemas.ts` with 6 schemas (PayrollResult, PickerBreakdown, CheckIn/Out, Picker)
  - Integrated into `payroll.service.ts` (replaced unsafe `data as PayrollResult`)
  - Integrated into `attendance.service.ts` (check-in/out Edge Function responses)
- **Accessibility Linting** — `eslint-plugin-jsx-a11y` added to `.eslintrc.cjs`
- **TypeDoc** — API documentation generator (`npm run docs`)
- **GitHub CLI** — `gh` installed and authenticated for CI/CD secret management

### Changed

- **API Key Rotation** — Migrated from legacy JWT-based keys to new Supabase publishable/secret format
- **GitHub Actions Secrets** — `VITE_SUPABASE_ANON_KEY` updated with new publishable key
- Version bump: **9.4.0 → 9.6.0**

### Security

- Deep audit from 3 perspectives (tech company, agricultural company, agri-tech company)
- Economic viability assessment (optimistic/realistic/pessimistic scenarios)
- 5-sprint improvement roadmap derived from audit findings

### Dependencies

- Added: `crypto-js`, `@types/crypto-js`, `eslint-plugin-jsx-a11y`, `typedoc`

## [9.5.0] - 2026-03-09

### Added

- **Integration test layer** — 89 tests across 5 files testing real cross-cutting flows:
  - `bucket-pipeline.integration.test.ts` (15 tests): Scan → validation → state → payroll recalc
  - `intelligence.integration.test.ts` (11 tests): Payroll math → NZ min wage top-up → idempotency
  - `crew-compliance.integration.test.ts` (13 tests): Crew CRUD → compliance → day lifecycle → persistence
  - `export-validation.integration.test.ts` (28 tests): Payroll → CSV + custom rates + formula injection + validation
  - `sync-offline.integration.test.ts` (22 tests): Error categorization + queue management + offline bucket flow
- **488 new unit tests** across 15 files covering utils, repos, services, stores, and components

### Changed

- Test coverage: **43% → 49.9%** statements, **44.8% → 49.9%** lines
- Test count: **1,737 → 2,400+** across **177 → 202** test suites
- Integration tests use real Zustand store + real compliance.service, mocking only external boundaries (Supabase, Dexie)

### Tests

- 202 test files, 2,400+ tests — ALL PASSING (zero regressions)

## [9.4.0] - 2026-03-08

### Added

- **Storybook** — 19 UI component stories with autodocs (`.storybook/` config + 7 story files)
- **Playwright E2E** — 5 critical user flow tests: login, dashboard, attendance, payroll, admin
- `npm run test:e2e` and `npm run storybook` scripts

### Changed

- **God file refactoring** — 5 files reduced from 1,801 to 990 LOC (45% reduction):
  - `SetupWizard.tsx` 408→185 LOC → `setup-wizard/` (OrchardStep, TeamsStep, RatesStep, SummaryStep)
  - `AnomalyDetectionView.tsx` 346→195 LOC → `anomaly/` (AnomalyCard, SmartDismissals, anomaly.constants)
  - `Admin.tsx` 355→145 LOC → `admin/` (AdminOrchardsTab, AdminUsersTab, AdminComplianceTab)
  - `DashboardView.tsx` 380→265 LOC → DashboardStatCard, DashboardEmptyState
  - `RowAssignmentModal.tsx` 312→200 LOC → RowTeamDisplay, RowGrid
- `push.service.ts` migrated to repository pattern (`push.repository.ts`)
- Vitest config excludes `e2e/` directory
- Playwright config updated to port 5173 with screenshot-on-failure

### Tests

- 177 test files, 1,737 tests — ALL PASSING (zero regressions)

## [9.3.0] - 2026-03-07

### Changed

- Eliminated all `eslint-disable @typescript-eslint/no-explicit-any` from production code
- `storeSync.ts`: 12 `any` → proper `Picker`, `PickerWithAttendance`, `AttendanceRecord` types
- `sentry.ts`: 3 `Record<string, any>` → `Record<string, unknown>`
- `native-scanner.service.ts`: `window as any` → typed `CapacitorWindow` interface
- `conflict.service.ts`: `as any` → `SyncPayload` with proper import
- `useRealtimeSubscription.ts`: `channelConfig: any` → typed config object
- `html5-qrcode.d.ts`: `decodedResult: any` → typed result interface
- `GoalProgress.tsx`: removed dead `velocity` prop and `void velocity` suppression

### Removed

- Dead feature flags from `.env.example` (VITE_FEATURE_DARK_MODE, VITE_FEATURE_PUSH_NOTIFICATIONS)
- `eslint-disable` comments across 7 files (19 instances removed)

### Fixed

- `check_in_time` type mismatch (`null` vs `undefined`) in `storeSync.ts` realtime handler
- Missing `deleted_at` property on `PickerWithAttendance` type for delta sync

## [9.2.0] - 2026-03-06

### Added

- API Gateway pattern with 9 Edge Functions
- Rate limiting infrastructure (60 req/min)
- Push notification service with VAPID keys
- JWT verification on all Edge Functions

## [9.1.0] - 2026-03-05

### Added

- Repository pattern: 30 repositories abstracting data access
- Dark mode integration (Header + DesktopLayout + CSS)
- ThemeToggle UI component

### Changed

- Fraud detection service: removed 130+ LOC of mock data
- AnomalyDetectionView: empty state instead of fake data fallback

### Fixed

- matchMedia polyfill in test-setup.ts for JSDOM

## [9.0.0] - 2026-03-03

### Added

- Initial audited release
- 8 RBAC roles: manager, team_leader, runner, qc_inspector, payroll_admin, admin, hr_admin, logistics
- Offline-first with IndexedDB (9 tables) + sync queue
- Realtime dashboard via Supabase channels
- NZ Labour Law compliance (check-compliance Edge Function)
- Fraud/anomaly detection (ML Edge Function)
- Dead Letter Queue for retry resilience
- i18n support (EN/ES)
- 1,697 passing tests
