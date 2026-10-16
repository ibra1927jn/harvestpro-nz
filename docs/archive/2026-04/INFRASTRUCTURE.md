# 🏗️ HarvestPro NZ — Infrastructure Setup Guide

> Step-by-step guide for configuring production and staging environments.

---

## 1. Pre-Requisites

- [Supabase](https://supabase.com) account with billing enabled
- [Vercel](https://vercel.com) account linked to your GitHub repository
- [Sentry](https://sentry.io) account (optional but recommended)
- [PostHog](https://posthog.com) account (optional for analytics)
- GitHub repository with admin access for configuring secrets

---

## 2. Supabase Project Setup

### 2.1 Create Projects

Create **two** Supabase projects:

| Environment    | Project Name            | Region                                    |
| -------------- | ----------------------- | ----------------------------------------- |
| **Production** | `harvestpro-production` | `ap-southeast-2` (Sydney — closest to NZ) |
| **Staging**    | `harvestpro-staging`    | `ap-southeast-2` (Sydney)                 |

### 2.2 Execute Database Schema

For each project, run the consolidated schema in the **SQL Editor**:

```sql
-- Copy-paste the contents of:
-- supabase/schema_v3_consolidated.sql
-- This creates: 26 tables, 40+ RLS policies, 20+ functions, 1 VIEW
```

### 2.3 Seed Data

**Staging only** — run the test accounts seed:

```sql
-- supabase/seeds/seed_test_accounts.sql
-- Creates 8 test accounts with password: 111111
-- ⚠️ NEVER run this in production
```

**Production only** — bootstrap the first manager:

```sql
-- supabase/seeds/seed_production_admin.sql
-- Edit the email and name before running
-- No passwords are created — user registers with their own password
```

### 2.4 Run Privacy Consent Migration

For both environments:

```sql
-- supabase/migrations/20260317_privacy_consent.sql
-- Adds privacy_consent_at to users and pickers tables
```

### 2.5 Collect Credentials

From each project's **Settings → API**, collect:

| Key                 | Where to Find                      |
| ------------------- | ---------------------------------- |
| `SUPABASE_URL`      | Settings → API → Project URL       |
| `SUPABASE_ANON_KEY` | Settings → API → `anon` public key |

---

## 3. GitHub Actions Secrets

Navigate to your repository: **Settings → Secrets and variables → Actions**

### Required Secrets

| Secret Name                    | Value                        | Used By               |
| ------------------------------ | ---------------------------- | --------------------- |
| `SUPABASE_URL`                 | Staging Supabase URL         | CI Pipeline           |
| `SUPABASE_ANON_KEY`            | Staging Supabase anon key    | CI Pipeline           |
| `STAGING_SUPABASE_URL`         | Staging Supabase URL         | deploy-staging.yml    |
| `STAGING_SUPABASE_ANON_KEY`    | Staging Supabase anon key    | deploy-staging.yml    |
| `PRODUCTION_SUPABASE_URL`      | Prod Supabase URL            | deploy-production.yml |
| `PRODUCTION_SUPABASE_ANON_KEY` | Prod Supabase anon key       | deploy-production.yml |
| `VERCEL_TOKEN`                 | Vercel personal access token | Both deploys          |
| `VERCEL_ORG_ID`                | Vercel organization ID       | Both deploys          |
| `VERCEL_PROJECT_ID`            | Vercel project ID            | Both deploys          |

### Optional Secrets

| Secret Name         | Value                     | Used By           |
| ------------------- | ------------------------- | ----------------- |
| `SENTRY_DSN`        | Sentry project DSN        | Error tracking    |
| `SENTRY_AUTH_TOKEN` | Sentry auth token         | Source map upload |
| `SENTRY_ORG`        | Sentry organization slug  | Source map upload |
| `SENTRY_PROJECT`    | Sentry project slug       | Source map upload |
| `POSTHOG_KEY`       | PostHog project API key   | Product analytics |
| `POSTHOG_HOST`      | `https://app.posthog.com` | Product analytics |

---

## 4. Deployment Flow

```text
┌─────────────────────────────────────────────────────┐
│                  Developer Workflow                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  feature/branch  ──push──→  CI Pipeline             │
│                             ├─ TypeScript Check     │
│                             ├─ ESLint               │
│                             ├─ Vitest (3728+ tests) │
│                             ├─ Security Scan        │
│                             └─ Build                │
│                                                     │
│  staging branch  ──push──→  CI + Deploy Staging     │
│                             ├─ All CI checks        │
│                             ├─ Build with staging   │
│                             │    Supabase keys      │
│                             └─ Deploy to Vercel     │
│                                                     │
│  main branch     ──push──→  CI + Deploy Production  │
│                             ├─ All CI checks        │
│                             ├─ Coverage threshold   │
│                             ├─ Build with prod keys │
│                             ├─ Deploy to Vercel     │
│                             ├─ Health check         │
│                             └─ Smoke tests          │
└─────────────────────────────────────────────────────┘
```

---

## 5. Environment Variables (.env.local)

For local development, create `.env.local`:

```env
# Supabase (required)
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-staging-anon-key

# Sentry (optional — omit for no error tracking)
VITE_SENTRY_DSN=https://your-sentry-dsn

# PostHog (optional — omit for no analytics)
VITE_POSTHOG_KEY=your-posthog-key
VITE_POSTHOG_HOST=https://app.posthog.com
```

---

## 6. Edge Functions Deployment

Supabase Edge Functions must be deployed separately from the frontend:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy all functions
supabase functions deploy approve-timesheet
supabase functions deploy calculate-payroll
supabase functions deploy check-compliance
supabase functions deploy detect-anomalies
supabase functions deploy manage-admin
supabase functions deploy manage-attendance
supabase functions deploy record-bucket
supabase functions deploy send-push
supabase functions deploy submit-audit-log
```

---

## 7. Verification Checklist

After setup, verify:

- [ ] Staging Supabase project has all 26 tables
- [ ] Production Supabase project has all 26 tables
- [ ] GitHub secrets are all configured (check Settings → Secrets)
- [ ] CI pipeline passes on a test push to `staging`
- [ ] Login works with staging test accounts
- [ ] Edge Functions are deployed to the staging project
- [ ] Privacy consent modal shows on first login
