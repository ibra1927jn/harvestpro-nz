# Project Logic & Structure Analysis

**Date:** February 6, 2026

## 1. High-Level Architecture

The project is a **Vite + React (TypeScript)** Progressive Web App (PWA) designed for orchard management. It uses a **component-based architecture** with a strong separation of concerns between:

- **Pages**: Role-specific dashboards (`Manager`, `Runner`, `TeamLeader`).
- **Components**: Reusable UI blocks (`components/manager`, `components/modals`).
- **Services**: Business logic and external API handling (`services/`).
- **Context**: Global state management (`context/`).

## 2. State Management Logic

The application uses **Zustand** (global state), **React Query** (server state), and **React Context** (auth, messaging) for state management.

### **useHarvestStore** (Zustand — `stores/useHarvestStore.ts`)

- **Purpose**: Central hub for operational data (Crew, Bins, Stats).
- **Logic**:
  - **Real-time**: Subscribes to Supabase real-time channels to update stats instantly.
  - **Optimistic Updates**: UI updates immediately upon action, then syncs with backend.
  - **Offline Fallback**: Seamlessly switches to `offlineService` if backend is unreachable.
  - **Delta Sync**: Fetches only records changed since `lastSyncAt` (updated_at-based, 2-min jitter).

### **AuthContext** (`context/AuthContext.tsx`)

- **Purpose**: Handles user authentication and profile loading.
- **Logic**:
  - Wraps Supabase Auth.
  - **Role Resolution**: Determines if a user is a `MANAGER`, `TEAM_LEADER`, or `RUNNER` based on the `users` table, resolving potentially conflicting roles (e.g., `bucket_runner` vs `runner`).
  - **Orchard Association**: Ensures users are linked to an orchard; if not, attempts to assign a default one.

## 3. Offline Strategy (Robust)

The project implements a "Local-First" approach, crucial for orchard environments with poor connectivity.

### **Offline Service** (`services/offline.service.ts`)

- **Storage**: Uses **Dexie.js (IndexedDB)** (Version 2) for high-performance storage.
- **Queue System**:
  - Actions are stored with a numeric sync status: `0` (Pending), `1` (Synced), `-1` (Error).
  - **Dead Letter Queue (DLQ)**: Items that fail after 3 retries (e.g., due to deleted picker or referenced data conflict) are marked as `-1` (Error) and moved out of the active processing loop to prevent infinite retry loops. `failure_reason` is recorded.
  - **Retry Logic**: Exponential backoff (1s, 2s, 4s) used for transient network errors.
  - **Conflict Handling**:
    - **Data Integrity**: Foreign Key constraints (e.g., invalid picker_id) trigger a permanent failure state (-1), preventing the queue from stalling.
    - **Visibility**: `getConflictCount()` allows the UI to surface synchronization issues to the user.
- **Detection**: actively listens to browser `online` and `offline` events to trigger syncs automatically.

## 4. Role-Based Workflows

### **Manager Flow** (`pages/Manager.tsx`)

- **Dashboard**: High-level stats, velocity graphs, and financial estimates.
- **Crew Management**: Live leaderboard of pickers. Includes search and sorting.
- **Logic**: Direct read access to all aggregated data. Uses `database.service.ts` for heavy queries.

### **Runner Flow** (`pages/Runner.tsx`)

- **Logistics Focus**: managing bins and collecting buckets.
- **UI**: High-fidelity interface with large touch targets.
- **Logic**:
  - **Scanner Integration**: Uses camera to scan QR codes/Barcodes.
  - **Feedback Loop**: Instant visual feedback on scans (Success/Error modal).
  - **Offline-First**: Heavily relies on cached data and the offline queue, assuming connectivity is intermittent.

## 5. Database & Security

The backend is **Supabase (PostgreSQL)**.

- **Schema**:
  - `users`: Extended profile data linked to `auth.users`.
  - `pickers`: The workforce. Distinct from app users (pickers might not log in).
  - `bucket_records`: The core ledger of all work done.
  - `orchards`: Multi-tenancy support.
- **Security (RLS)**:
  - **Row Level Security** is enabled.
  - **Fixes**: Recent scripts (`fix_auth_errors.sql`, `fix_rls_final.sql`) addressed recursion issues where users couldn't read their own team members due to circular policy logic.
  - **Policies**: Strict separation—Runners can only create records; Managers can read all orchard records.

## 6. Code Quality & Standards

- **TypeScript**: Strong typing used throughout (`types.ts`).
- **Tailwind CSS**: Utility-first styling with custom animations in `index.css`.
- **Modularity**: Code is well-structured. New features are added as separate files rather than bloating existing ones (e.g., separate SQL scripts for fixes).

## 7. Known Limitations

- **Deep Conflict Resolution**: While the system handles "hard" conflicts (e.g., deleted records) via the Dead Letter Queue, "soft" conflicts (e.g., Manager and Runner editing the same field simultaneously) currently follow a "last write wins" server-side policy.
- **Map View Integration**: The `HeatMapView.tsx` exists but isn't fully integrated into the Manager dashboard.

## 8. Recommendations

1. ~~**Map View**: The `HeatMapView.tsx` exists but isn't fully integrated into the Manager dashboard.~~ ✅ **Done** — HeatMapView integrated with real Supabase queries.
2. ~~**Testing**: Unit tests exist (`*.test.ts`), but E2E testing (e.g., Playwright) would validate the offline flows better.~~ ✅ **Done** — 3,728+ tests + 5 Playwright E2E suites.
3. ~~**Error Boundaries**: Adding React Error Boundaries would prevent the white screen issues if a single component crashes.~~ ✅ **Done** — Every route wrapped in `ErrorBoundary`.

## 9. Sprint 8 — Code Quality & Performance (Feb 2026)

- **P0**: 17 silent `catch {}` blocks fixed, 3 RLS gaps remediated (day_closures, bins, qc_inspections)
- **P1**: `fetchGlobalData()` refactored (217→15 lines, 4 helpers), `DashboardView` split (338→190 lines, 3 sub-components)
- **P2**: React.memo on heavy lists, comments standardized to English, Playwright config enhanced with Service Worker timeout

## 10. Sprint 14 — Tier 2 Technical Debt (Mar 2026)

- **God file refactoring**: 5 monolithic files (>300 LOC each) decomposed into slim orchestrators + 15 extracted sub-components. Total LOC reduced from 1,801 → 990 (45%)
- **Repository pattern**: `push.service.ts` migrated to use `push.repository.ts` for data access abstraction
- **Storybook**: Configured with 19 UI component stories (autodocs), `.storybook/` directory
- **Playwright E2E**: 5 critical user flow tests added (login, dashboard, attendance, payroll, admin)

## 11. Sprint 15 — Test Coverage Push (Mar 2026)

- **577 new tests** added (+34% growth), total: 2,400+ tests across 202 suites
- **Coverage**: 43% → 49.9% statements, 44.8% → 49.9% lines
- **488 unit tests** (15 files): utils (94), repos (70), services (225), stores (10), components (89)
- **89 integration tests** (5 files): Tests use **real Zustand store + real compliance.service**, mocking only Supabase/Dexie:
  - `bucket-pipeline` (15): Scan → anti-fraud → archived rejection → payroll recalc
  - `intelligence` (11): Payroll math → NZ min wage top-up → idempotency
  - `crew-compliance` (13): Crew CRUD → compliance → day lifecycle → persistence
  - `export-validation` (28): Payroll → CSV + custom rates + formula injection + validation
  - `sync-offline` (22): Error categorization × 13 + queue management + offline bucket flow

## 12. Sprint 17 — Audit Bug Fixes + Test Coverage (Mar 2026)

- **All 6 Deep Audit v3 bugs fixed**: BUG-1 through BUG-6, DES-2, DES-3
- **BUG-3 fix**: Zod schemas for CONTRACT, TRANSPORT, TIMESHEET sync payloads in `sync.service.ts`
- **DES-2 fix**: `MINIMUM_WAGE` centralized from `types.ts` across 3 files (previously hardcoded)
- **88 new tests**: 21 store slice tests + 67 hook tests
- **Test suite**: 3,728+ tests across 344 files — 100% pass rate

_Last updated: 2026-03-16 | Sprint 17_
