# HarvestPro NZ

**Offline-first harvest management for New Zealand orchards** — bucket scanning, team and row management, timesheets, piece-rate pay with minimum-wage top-up, HR and quality control, in one installable web app with eight role-based workspaces.

![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline--first-5A0FC8)
![Android](https://img.shields.io/badge/Android-Capacitor%208-3DDC84?logo=android&logoColor=white)
![Status](https://img.shields.io/badge/status-pre--pilot-orange)

> **Status (30 October 2026):** in active development towards a first pilot. All October work (up to the 27 October integration, the security and payroll review of Phase 2, and the 30 October clean-up) is merged into `main`. It runs **only on a local Supabase stack** (Docker); there is no hosted deployment (the Vercel and Hetzner deployments were retired on 10 October 2026). It has **no production users yet**. The current work plan is [docs/PLAN_NIVEL.md](docs/PLAN_NIVEL.md) and a short status is in [PROGRESS.md](PROGRESS.md). Known gaps are listed openly under [Known gaps](#known-gaps).

---

## The problem

A New Zealand orchard in harvest runs on paper tallies, WhatsApp groups and a spreadsheet that someone rebuilds every Friday for payroll. Pickers are paid per bin or bucket, but the law says every hour worked must still reach the minimum wage. People move between orchards of the same company during the week, signal in the rows is unreliable, and the crew speaks half a dozen languages.

HarvestPro replaces that with one app that works **without signal in the field**, records every bucket against the right person, row and orchard, and turns the week's scans and hours into a pay calculation that payroll can review, close and export.

## What it does

| Role              | Workspace highlights                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runner**        | Scan picker QR codes for each bucket (works offline), bin and warehouse view, messaging                                                                       |
| **Team leader**   | Own team roster, check-in / check-out and breaks, row assignments, team messaging                                                                             |
| **Manager**       | Live orchard dashboard, row map and heat map, team-to-row assignment with row history, timesheet review, cost analytics, anomaly alerts, MPI export readiness |
| **QC inspector**  | Fruit quality inspections with photos, grade distribution, trends                                                                                             |
| **HR admin**      | Employees, contracts, HR documents (secure storage), calendar, seasonal planning, team moves                                                                  |
| **Payroll admin** | Weekly timesheets, approve or reject hours, pay-week close with locked snapshot, wage calculator, Xero and PaySauce CSV export                                |
| **Logistics**     | Bin inventory, fleet, transport requests and history                                                                                                          |
| **Admin**         | Company setup wizard, orchards, users and invitations                                                                                                         |

Across every role: **3 languages** (English, Spanish, French), installable on phones as a PWA or Android app, and two-factor authentication for privileged accounts.

## Highlights

- **Offline scanning that does not lose or duplicate buckets.** Each scan gets a device-generated ID and is written to IndexedDB before the runner sees "saved". Uploads are batched and idempotent on the server, so a lost response or a resend never creates a second bucket. Rejected scans go to a dead-letter queue that managers can see.
- **One pay engine, two places.** The same pay rules run in the browser (instant feedback) and in an Edge Function (the source of truth). The two files are byte-identical and a test fails if they ever diverge. A differential test runs a realistic week — Matariki, orchard switches, a shift past midnight — against an independent reference implementation, to the cent.
- **NZ pay rules built in:** piece-rate with daily minimum-wage top-up, public holidays at time-and-a-half with alternative days, only recorded breaks deducted, weekly pay summed across all orchards a person worked at.
- **Pay weeks that stay closed.** Closing a week stores a snapshot; database triggers then lock that week's attendance and scans.
- **Security in the database, not just the UI.** Row-level security on every table, role checks re-read from the database on the server, 2FA (`aal2`) enforced by Postgres policies for admin, manager, payroll and HR accounts, and a SQL security suite with **797 checks** covering who can read and change what.

## Architecture

```mermaid
flowchart LR
  subgraph Device["Phone / tablet (PWA or Android)"]
    UI["React 19 UI<br/>8 role workspaces"]
    Store["Zustand store"]
    Dexie[("IndexedDB (Dexie)<br/>scans, outbox,<br/>dead-letter queue")]
    UI --> Store --> Dexie
  end

  subgraph Supabase["Supabase (local Docker today)"]
    Auth["Auth + 2FA"]
    PG[("Postgres<br/>35 tables, RLS on all")]
    Edge["Edge Functions (Deno)<br/>record-bucket · calculate-payroll<br/>close-pay-week · approve-timesheet<br/>manage-attendance · check-compliance · …"]
    Storage[("Storage<br/>HR documents, QC photos")]
  end

  Dexie -- "batched, idempotent sync" --> Edge
  Store -- "queries (RLS)" --> PG
  Edge --> PG
  UI --> Auth
  UI --> Storage
  Edge -- "CSV export" --> Payroll["Xero / PaySauce"]
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

| Layer         | Choices                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript (strict, no `any`), Vite 7, Tailwind 3, React Router 7                                                 |
| State & data  | Zustand, TanStack Query, Dexie (IndexedDB), Zod 4 at every boundary                                                         |
| Backend       | Supabase: Postgres with RLS, Auth with TOTP 2FA, Storage, Deno Edge Functions                                               |
| Mobile        | PWA with service worker, Capacitor 8 for Android                                                                            |
| Quality       | Vitest, Testing Library, Playwright (desktop and mobile), Stryker mutation testing, SQL security suite, Deno function tests |
| Observability | Sentry (text masked, PII scrubbed), PostHog (opt-in, no emails or raw worker ids)                                           |

## Quality, measured

Numbers from local runs, not targets (dates in the table). CI runs lint, the unit tests in 5 shards, the build, the Edge Function tests and the mobile e2e suite against a real local Supabase on every pull request:

| Check                                                | Result                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Unit and component tests (Vitest, 579 files, 30 Oct) | **6,002 passing** (`npm test`, no `.env`)                         |
| Database security suite (SQL, RLS and 2FA, 16 Oct)   | **797 / 797 passing** (Phase 2 added a 35-table RLS matrix since) |
| TypeScript `--noEmit`                                | 0 errors                                                          |
| ESLint (`--max-warnings 0`)                          | 0 warnings                                                        |
| End-to-end specs (Playwright)                        | 40 specs, desktop and mobile                                      |
| Edge Function tests (Deno)                           | 16 files, including a payroll differential test                   |

## Getting started (local)

**Requirements:** Node 22, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
git clone https://github.com/ibra1927jn/harvestpro-nz.git
cd harvestpro-nz
npm ci

# Local Supabase (Postgres, Auth, Storage, Edge runtime) in Docker
supabase start
supabase db reset          # applies all migrations

# Demo data, in this order
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seeds/seed_00_local_bootstrap.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seeds/seed_2weeks_local.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seeds/seed_role_users.sql

cp .env.example .env.local   # then paste the API URL and anon key printed by `supabase start`
npm run dev                  # http://localhost:5173
```

**Demo accounts** (local seeds only): `manager@`, `lead@`, `runner@`, `qc@`, `payroll@`, `hr@`, `logistics@`, `admin@harvestpro.nz` — password `111111`.

Privileged accounts need 2FA. On a development machine you can switch it off with `VITE_MFA_ENFORCE=false` in `.env.local` **and** `scripts/dev-disable-mfa.sql` on the database (both are needed: the database enforces it too).

### Tests

- `npm test` runs the unit and component tests in a clean clone **without any `.env`**: `src/test-env.ts` sets placeholder Supabase values when they are missing.
- `npm run test:integration` runs the tests that need a real database (`tests/integration/`, `src/integration/*supabase*`, `role-flows-sanity`); start the local stack first with `supabase start`.
- Database security suite, Edge Function tests and Playwright also need the local stack (see below).

### Useful commands

```bash
npm test                       # unit and component tests (no .env needed)
npm run test:integration       # tests against the local Supabase (needs `supabase start`)
npm run lint                   # ESLint, zero warnings allowed
npm run build                  # type-check + production build
npm run test:e2e               # Playwright
scripts/test-db-security.sh    # SQL security suite against the local database
npm run test:functions         # Edge Function tests (Deno, needs .env.local)
npm run i18n:check             # every key translated in every language
```

## Payroll scope

HarvestPro calculates **gross pay and records hours**: piece-rate earnings, the minimum-wage top-up (using the legal minimum in force on each day, from a dated table), public-holiday rates and alternative days. It then exports to the company's payroll provider (Xero or PaySauce).

By design, the payroll provider handles **the 8% pay-as-you-go holiday pay for casual staff**, PAYE, KiwiSaver, ACC levies, payslips and payday filing with Inland Revenue. HarvestPro does not calculate those.

## Known gaps

From the [16 October 2026 external audit](docs/audits/2026-10-16-external-audit.md) and the [23 October wiring audit](docs/audits/2026-10-23-wiring-audit.md); the full list of what is left is tracked in [docs/PLAN_NIVEL.md](docs/PLAN_NIVEL.md). These are open, not hidden:

- **Public holidays:** regional anniversary days (e.g. Otago) are missing, and the holiday list only covers 2026–2027.
- **Public holidays (2):** a holiday on a weekend is only applied on the Monday it is moved to, and an unworked public holiday that would otherwise have been a working day is not paid.
- **Offline:** roll call, breaks and bucket scans work without signal; other office screens (payroll, HR, setup) need it.
- **Multi-company:** one installation = one company. Several companies in one database would need a tenant column and stricter policies.

## Deployment

There is none on purpose: the only environment is Supabase in Docker on the developer's machine plus `npm run dev` (or `vite preview`). Hosted Supabase Cloud projects, Vercel and the Hetzner server were retired in October 2026, and their guides live in `docs/archive/2026-04/`. CI builds the web app and an unsigned Android APK as artefacts, without deploying.

## Documentation

| Document                                                                                                   | What it covers                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                               | How the pieces fit: offline sync, pay engine, security model                                   |
| [docs/PLAN_NIVEL.md](docs/PLAN_NIVEL.md)                                                                   | Current work plan, phase by phase (Spanish)                                                    |
| [PROGRESS.md](PROGRESS.md)                                                                                 | Short status: done, pending (Spanish)                                                          |
| [docs/audits/](docs/audits/)                                                                               | Audits: external (16 Oct), load test, role reviews, wiring (23 Oct), branch inventory (27 Oct) |
| [docs/RAMAS.md](docs/RAMAS.md)                                                                             | Branches: what was merged, what to delete, how to restore an archived one (Spanish)            |
| [docs/PATTERNS.md](docs/PATTERNS.md)                                                                       | React and TypeScript patterns used in the codebase                                             |
| [docs/MANUAL_OPERACIONES.md](docs/MANUAL_OPERACIONES.md)                                                   | Field manual for team leaders (Spanish)                                                        |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)                                                                 | 15-minute demo walkthrough                                                                     |
| [docs/DATA_RETENTION_POLICY.md](docs/DATA_RETENTION_POLICY.md)                                             | What is kept and for how long                                                                  |
| [docs/legal/](docs/legal/)                                                                                 | Privacy policy, terms, data processing agreement (drafts)                                      |
| [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY_RULES.md](SECURITY_RULES.md) · [CHANGELOG.md](CHANGELOG.md) | Working rules and history                                                                      |
| [docs/archive/](docs/archive/)                                                                             | Earlier audits and retired guides (historical)                                                 |

## About this project

Designed and directed by **Ibrahim Boutebila**, drawing on hands-on work in New Zealand harvests. The implementation is built with AI coding agents (mainly Claude Code) under his direction: he defines what each role and screen must do, reviews the behaviour, and decides the business rules.

## License

Proprietary. All rights reserved.
