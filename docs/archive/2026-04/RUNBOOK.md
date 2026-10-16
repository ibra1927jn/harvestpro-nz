# HarvestPro NZ — Production Runbook

> **INF-3 FIX:** This runbook was identified as missing in the external audit.  
> Update it whenever a new failure mode is discovered and resolved.

**Last updated:** 20 March 2026

---

## 1. Edge Function Failure

**Symptoms:** API calls 500, picker scanning fails, payroll returns error.

```bash
# Check logs
supabase functions logs calculate-payroll --tail
# Redeploy all functions
supabase functions deploy --all
```

**Fallback:** Workers can continue scanning offline — records queue to IndexedDB. Payroll falls back to direct DB queries.

---

## 2. Sync Queue Overflow

**Symptoms:** Persistent "Syncing…" indicator, growing bucket count.

1. DevTools → Application → IndexedDB → `harvestpro-offline` → `dead_letter_queue`
2. From browser console: `await syncService.forceFlush()`
3. Clear stale DLQ items: `await deadLetterQueueService.clearStale()`

---

## 3. Database Backup & Recovery

### Backup Strategy (Free-Tier)

> [!NOTE]
> Supabase PITR requires Pro Plan ($25/mo) + addon ($100/mo). We use GitHub Actions as a free alternative.
> Daily backup runs at 23:00 NZST via `.github/workflows/backup.yml`
> Backups retained for 30 days as GitHub Artifacts.

### GitHub Secrets Required (set once in repo Settings → Secrets)

| Secret | How to find it |
|---|---|
| `DATABASE_HOST` | Supabase → Project Settings → Database → Host |
| `DATABASE_USER` | Supabase → Project Settings → Database → User |
| `DATABASE_PASSWORD` | Supabase → Project Settings → Database → Password |
| `DATABASE_NAME` | Usually `postgres` |

> [!TIP]
> Use the **Direct connection** URL from Supabase, NOT the pooler (Supavisor) URL.
> The pooler doesn't support pg_dump mode=custom.

### Manual Backup
```bash
export DATABASE_HOST=db.mcbtyaebetzvzvnxydpy.supabase.co
export DATABASE_USER=postgres
export DATABASE_PASSWORD=<your-db-password>
export DATABASE_NAME=postgres
./scripts/backup.sh
```

### Emergency Restore from Backup File
```bash
./scripts/backup.sh --restore backups/harvestpro_20260320_230000.dump
# Type 'RESTORE' when prompted
```

### List Contents of a Backup (without restoring)
```bash
./scripts/backup.sh --list backups/harvestpro_20260320_230000.dump
```

### Supabase PITR (when you upgrade to Pro)
- Dashboard → Database → Backups → Point in time
- Restores to the second — $100/mo add-on on Pro plan

---

## 4. Offline Data Recovery

1. Reconnect device — app auto-syncs on reconnect
2. Watch "Syncing…" → "Synced" badge
3. If sync fails: **Settings → Sync Now**

> [!WARNING]
> If worker's device is replaced, AES key (from localStorage salt) is lost. Unsynced data on that device cannot be recovered. Synced Supabase data is unaffected.

---

## 5. Emergency Wage Rate Update

1. Admin → Settings → Wage Rates
2. Update affected roles, set **Effective From** to government mandate date
3. Historical payroll is NOT retroactively recalculated

```sql
-- Direct DB update if UI unavailable
UPDATE wage_rates
SET hourly_rate = 23.15, notes = 'Emergency update', updated_at = NOW()
WHERE job_type = 'picker' AND hourly_rate < 23.15;
```

---

## 6. Account Lock

```sql
-- Unlock a locked user account
DELETE FROM user_lockouts WHERE user_id = '<user_id>';
```

---

## 7. Escalation

| Severity | Response | Who |
|---|---|---|
| P0 Production down | 15 min | CTO + Lead Dev |
| P1 Payroll affected | 1 hour | Lead Dev + HR |
| P2 Feature degraded | 4 hours | Lead Dev |
| P3 Minor issue | Next sprint | Dev team |
