# External audit — 16 October 2026

**Scope:** the full development line (`fix/audit-harvest`, 254 commits ahead of the April `main`), now merged into `main` (`470c544c`).
**Method:** independent review of the code, the 90 database migrations, the 12 Edge Functions and the client; every automated check run from scratch; database migrations, seeds and the SQL security suite applied to a clean PostgreSQL 16; findings re-verified by hand before reporting.

## Verdict

Engineering quality is well above average for a project of this size: strict TypeScript with no errors, a lint gate at zero warnings, 5,339 passing unit tests at audit time, mutation testing, a SQL security suite and solid server-side 2FA. The pay engine has a single source of truth and an independent differential test.

It was **not ready for a pilot** on the day of the audit, mainly because of one live credential in the repository, a development process where nothing reached `main` for six months, and a team-permission gap in the database. Those three are now fixed (below). The remaining items are listed with their status.

## Automated checks (as run)

| Check                       | Result                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `tsc --noEmit`              | 0 errors                                                                    |
| `npm run lint`              | 0 warnings                                                                  |
| Vitest (CI placeholder env) | 5,339 passing; 1 integration test needs a running local Supabase (expected) |
| `vite build`                | OK; largest chunk is Sentry (≈147 KB gzip)                                  |
| SQL security suite          | 733 / 733 before fixes → 769 / 769 after (new picker-team checks)           |
| `npm audit --omit=dev`      | 2 critical, 6 high                                                          |

## Findings and status

### Fixed during the audit

| #   | Severity           | Finding                                                                                                                                                                                          | Resolution                                                                                                                                                                                                                                                                             |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Critical           | A `service_role` key and database password for a Supabase Cloud project were committed in `scripts/setup-db.cjs`; the fix lived on a branch never merged; the repository is public.              | Cloud projects deleted by the owner (keys dead). Script and `supabase/.temp/` removed from the repository.                                                                                                                                                                             |
| 2   | Critical (process) | `main` was six months behind; 254 commits sat in a stack of ~36 chained branches, 79 branches in total.                                                                                          | `main` fast-forwarded to the tip (no conflicts, full history kept). Old side branches preserved in `archive/2026-04`.                                                                                                                                                                  |
| 3   | High               | Four March RLS policies on `pickers` were still active. Because policies are OR'ed, any team leader could edit, archive or reassign anyone in the company, and managers could delete staff rows. | Migration `20261016000000_picker_team_rules.sql`: team leaders manage only their own team and may take someone without a team; only HR/admin move, release, archive or delete people; managers can no longer delete. Team leader UI no longer offers "remove". 35 new security checks. |

### Open

| #   | Severity | Area         | Finding                                                                                                                                                                                               | Suggested fix                                                                                                  |
| --- | -------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 4   | High     | Payroll      | 8% pay-as-you-go holiday pay for casual staff is not calculated or exported.                                                                                                                          | Calculate it as its own pay line, or document that the payroll provider adds it.                               |
| 5   | High     | Payroll      | No regional anniversary days (Otago Anniversary falls in harvest).                                                                                                                                    | Region per orchard plus a dated holiday table.                                                                 |
| 6   | High     | Offline      | If a local IndexedDB schema upgrade fails, the database is wiped and reloaded, losing unsent scans.                                                                                                   | Copy unsent scans aside before the reset and re-queue them afterwards.                                         |
| 7   | High     | Dependencies | `@capacitor/android` (critical), `react-router` (high) and transitive packages have advisories.                                                                                                       | Update to patched versions and re-run the suites.                                                              |
| 8   | Medium   | Payroll      | Minimum wage is one constant (23.95) with no effective dates; the public holiday list ends in 2027; weekend holidays are only applied on the Monday-ised date; unworked public holidays are not paid. | Dated rate table applied per day; generate holidays (Easter, Matariki official dates) instead of a fixed list. |
| 9   | Medium   | Security     | A user can change their own `orchard_id` and so act in another orchard (same company today).                                                                                                          | Restrict the column to HR/admin. Becomes critical if several companies ever share a database.                  |
| 10  | Medium   | Security     | Account lockout table accepts inserts from anyone and is only checked by the client (denial-of-service on any account, no real brute-force protection).                                               | Remove it and rely on Supabase Auth rate limits and captcha.                                                   |
| 11  | Medium   | Security     | Managers can read HR identity documents (passports, visas) for every orchard.                                                                                                                         | Limit to HR/admin.                                                                                             |
| 12  | Medium   | Offline      | Offline "encryption" key is derivable on the device; several tables are plaintext. Logout does wipe local data.                                                                                       | Accept and document, or add an idle wipe on shared devices.                                                    |
| 13  | Medium   | Offline      | Check-in / check-out need signal; hours then fall back to scan estimates, which block closing the week.                                                                                               | Queue attendance through the outbox like scans.                                                                |
| 14  | Low      | Security     | `qc-photos` bucket is public; `alerts` accepts inserts from any caller; farm settings readable across orchards; CORS accepts any `*.vercel.app` origin; in-memory rate limits.                        | Tighten in one hardening migration.                                                                            |
| 15  | Low      | Product      | The harness number edited on the team screen is not saved (the column does not exist).                                                                                                                | Add the column or remove the field.                                                                            |
| 16  | Low      | Data         | KiwiSaver constants still at 3% (3.5% from 1 April 2026). Not used in pay.                                                                                                                            | Update constants.                                                                                              |
| 17  | Low      | CI           | The SQL security suite is not run in CI.                                                                                                                                                              | Add a job with a Postgres service and the Supabase stubs.                                                      |

## What is genuinely strong

- Every table has RLS; all 45 `SECURITY DEFINER` functions pin `search_path`; legacy RPCs revoked from `anon`/`authenticated`.
- Edge Functions verify the JWT, read the role from `public.users` (not from user metadata), check the account is active, and validate input with Zod.
- Server-side 2FA is enforced by a restrictive policy on every table and on storage; the development bypass is off by default and cannot be changed through the API.
- Offline scans are idempotent end to end, with clock-drift detection and a visible dead-letter queue.
- Pay engine parity between client and server is enforced by a test; closed pay weeks are locked by triggers.
