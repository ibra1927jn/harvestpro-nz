# HarvestPro NZ

**Offline-first harvest management for New Zealand orchards** — bucket scanning, team and row management, timesheets, piece-rate pay with minimum-wage top-up, HR and quality control, in one installable web app with eight role-based workspaces.

![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline--first-5A0FC8)
![Android](https://img.shields.io/badge/Android-Capacitor%208-3DDC84?logo=android&logoColor=white)
![Status](https://img.shields.io/badge/status-pre--pilot-orange)

> **Status (October 2026):** in active development towards a first pilot, running on a local Supabase stack. It has **no production users yet**. Known gaps are listed openly under [Known gaps](#known-gaps) — see the latest [external audit](docs/audits/2026-10-16-external-audit.md).

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

Across every role: **7 languages** (English, Spanish, Te Reo Māori, Samoan, Tongan, Hindi, Tagalog), installable on phones as a PWA or Android app, and two-factor authentication for privileged accounts.

## Highlights

- **Offline scanning that does not lose or duplicate buckets.** Each scan gets a device-generated ID and is written to IndexedDB before the runner sees "saved". Uploads are batched and idempotent on the server, so a lost response or a resend never creates a second bucket. Rejected scans go to a dead-letter queue that managers can see.
- **One pay engine, two places.** The same pay rules run in the browser (instant feedback) and in an Edge Function (the source of truth). The two files are byte-identical and a test fails if they ever diverge. A differential test runs a realistic week — Matariki, orchard switches, a shift past midnight — against an independent reference implementation, to the cent.
- **NZ pay rules built in:** piece-rate with daily minimum-wage top-up, public holidays at time-and-a-half with alternative days, only recorded breaks deducted, weekly pay summed across all orchards a person worked at.
- **Pay weeks that stay closed.** Closing a week stores a snapshot; database triggers then lock that week's attendance and scans.
- **Security in the database, not just the UI.** Row-level security on every table, role checks re-read from the database on the server, 2FA (`aal2`) enforced by Postgres policies for admin, manager, payroll and HR accounts, and a SQL security suite with **771 checks** covering who can read and change what.

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
| Observability | Sentry (text masked), PostHog (opt-in)                                                                                      |

## Quality, measured

Numbers from the last full run (16 Oct 2026), not targets:

| Check                                        | Result                                          |
| -------------------------------------------- | ----------------------------------------------- |
| Unit and component tests (Vitest, 485 files) | **5,344 passing**                               |
| Database security suite (SQL, RLS and 2FA)   | **771 / 771 passing**                           |
| TypeScript `--noEmit`                        | 0 errors                                        |
| ESLint (`--max-warnings 0`)                  | 0 warnings                                      |
| End-to-end specs (Playwright)                | 40 specs, desktop and mobile                    |
| Edge Function tests (Deno)                   | 16 files, including a payroll differential test |

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

### Useful commands

```bash
npm test                       # unit and component tests
npm run lint                   # ESLint, zero warnings allowed
npm run build                  # type-check + production build
npm run test:e2e               # Playwright
scripts/test-db-security.sh    # SQL security suite against the local database
npm run test:functions         # Edge Function tests (Deno, needs .env.local)
npm run i18n:check             # every key translated in every language
```

## Payroll scope

HarvestPro calculates **gross pay and records hours**. It then exports to an external payroll provider (Xero or PaySauce), which handles PAYE, KiwiSaver, ACC levies, payslips and payday filing with Inland Revenue. HarvestPro does **not** do those deductions itself.

## Known gaps

From the [16 October 2026 external audit](docs/audits/2026-10-16-external-audit.md). These are open, not hidden:

- **Holiday pay:** the 8% pay-as-you-go holiday pay for casual staff is not calculated (it must be added in the payroll provider for now).
- **Public holidays:** regional anniversary days (e.g. Otago) are missing, and the holiday list only covers 2026–2027.
- **Minimum wage:** one current rate ($23.95, from 1 April 2026) instead of a dated table, so recalculating older weeks would use today's rate.
- **Offline:** check-in and check-out still need signal; if a local database upgrade fails, unsent scans on that device can be lost.
- **Multi-company:** one installation = one company. Several companies in one database would need a tenant column and stricter policies.

## Documentation

| Document                                                                                                   | What it covers                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                               | How the pieces fit: offline sync, pay engine, security model |
| [docs/audits/2026-10-16-external-audit.md](docs/audits/2026-10-16-external-audit.md)                       | Latest audit: findings, what was fixed, what is open         |
| [docs/PATTERNS.md](docs/PATTERNS.md)                                                                       | React and TypeScript patterns used in the codebase           |
| [docs/MANUAL_OPERACIONES.md](docs/MANUAL_OPERACIONES.md)                                                   | Field manual for team leaders (Spanish)                      |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)                                                                 | 15-minute demo walkthrough                                   |
| [docs/DATA_RETENTION_POLICY.md](docs/DATA_RETENTION_POLICY.md)                                             | What is kept and for how long                                |
| [docs/legal/](docs/legal/)                                                                                 | Privacy policy, terms, data processing agreement (drafts)    |
| [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY_RULES.md](SECURITY_RULES.md) · [CHANGELOG.md](CHANGELOG.md) | Working rules and history                                    |
| [docs/archive/](docs/archive/)                                                                             | Earlier audits and retired guides (historical)               |

## About this project

Designed and directed by **Ibrahim Boutebila**, drawing on hands-on work in New Zealand harvests. The implementation is built with AI coding agents (mainly Claude Code) under his direction: he defines what each role and screen must do, reviews the behaviour, and decides the business rules.

## License

Proprietary. All rights reserved.
