# PowerSync Migration Roadmap

## Current State: Custom Sync (v7)

The app has a **mature, battle-tested** sync layer:

| Component           | Implementation                                   |
| ------------------- | ------------------------------------------------ |
| Queue               | Dexie IndexedDB, 9 item types                    |
| Conflict resolution | `conflict.service.ts` with optimistic locking    |
| Dead Letter Queue   | DLQ in IndexedDB with admin review               |
| Cross-tab safety    | Web Locks API (mutex)                            |
| Error categorization| network / server / validation / unknown          |
| Retry logic         | Exponential with category-aware limits           |
| Online/offline      | `window.online` event → immediate sync           |

> [!IMPORTANT]
> This infrastructure **works in production**. PowerSync migration is an optimization, not a fix.

---

## Why PowerSync?

| Current limitation                    | PowerSync solves                        |
| ------------------------------------- | --------------------------------------- |
| Client-side diffing                   | Server-side change tracking via WAL     |
| Full table fetches on reconnect       | Incremental sync (only deltas)          |
| Manual conflict code per entity       | Built-in CRDT conflict resolution       |
| No real-time push                     | WebSocket-based live sync               |
| Dexie schema maintenance (v1→v7)      | Automatic local schema from Postgres    |

## When NOT to migrate

- If the app stays < 500 pickers (Dexie handles this fine)
- If offline sessions are < 4 hours (queue won't grow large)
- If budget doesn't allow PowerSync cloud ($99/mo minimum)

---

## Migration Plan (3 Phases)

### Phase A: PoC on Isolated Branch (1 week)

**Goal:** Validate PowerSync works with Supabase + existing RLS.

```bash
git checkout -b poc/powersync
npm install @powersync/web @powersync/supabase
```

1. Create `src/config/powersync.ts` — Schema definition mirroring Supabase tables
2. Create `src/services/powersync-connector.ts` — Supabase backend connector
3. Wire **ONE table** (`bucket_records`) through PowerSync
4. Verify: offline scan → airplane mode → reconnect → data appears in Supabase
5. Measure: sync latency, bundle size impact, IndexedDB storage

**Decision gate:** If PoC succeeds → Phase B. If RLS conflicts or bundle > +200KB → defer.

---

### Phase B: Parallel Mode (2 weeks)

**Goal:** Run PowerSync alongside existing Dexie for non-critical reads.

| Table                | Sync via         | Notes                          |
| -------------------- | ---------------- | ------------------------------ |
| `bucket_records`     | PowerSync        | Read from PS, write to both    |
| `pickers`            | PowerSync        | Read-only (server-authoritative) |
| `orchards`           | PowerSync        | Read-only                      |
| `daily_attendance`   | Dexie (existing) | Keep atomic RPCs               |
| `audit_logs`         | Dexie (existing) | Write-only, no sync needed     |

Key files to modify:

- `src/services/bucket-ledger.service.ts` — Read from PowerSync, write via RPC
- `src/hooks/useAttendance.ts` — Optional PowerSync read
- `src/services/sync.service.ts` — Delegate to PowerSync for supported types

---

### Phase C: Full Cutover (2 weeks)

**Goal:** Remove Dexie queue for synced tables, keep for offline-only caches.

1. Move all 9 sync types to PowerSync
2. Retire `sync.service.ts` `_doProcessQueue` switch statement
3. Keep Dexie for:
   - `settings_cache` (local-only)
   - `user_cache` (local-only)
   - `recovery` table (crash recovery)
4. Remove DLQ (PowerSync handles retries)
5. Update `db.ts` schema: remove `sync_queue`, `sync_meta`

---

## Risk Register

| Risk                 | Impact                          | Mitigation                             |
| -------------------- | ------------------------------- | -------------------------------------- |
| Bundle size +150KB   | Slower first load on 3G         | Lazy-load PowerSync SDK               |
| RLS policy conflicts | Users see others' data          | Test every RLS policy in PoC          |
| Supabase plan limits | 409 rate limits on sync         | PowerSync batches writes              |
| Migration data loss  | Pending items in Dexie queue    | Drain Dexie queue BEFORE cutover      |
| PowerSync outage     | No sync at all                  | Keep Dexie fallback for 30 days       |

---

## Cost Estimate

| Tier             | Price   | Fits                           |
| ---------------- | ------- | ------------------------------ |
| PowerSync Free   | $0      | < 1,000 synced rows            |
| PowerSync Pro    | $99/mo  | Up to 50K rows, 50 users      |
| PowerSync Scale  | Custom  | 500+ pickers, enterprise       |

> [!NOTE]
> Current Supabase plan already covers the backend. PowerSync cost is additive.

---

## Decision Checklist

Before starting Phase A, confirm:

- [ ] App has > 500 concurrent pickers OR offline sessions > 4 hours
- [ ] Budget approved for PowerSync Pro ($99/mo)
- [ ] Supabase project has `wal_level = logical` enabled
- [ ] Team has read [PowerSync + Supabase docs](https://docs.powersync.com/integration-guides/supabase)
- [ ] Isolated branch `poc/powersync` created
