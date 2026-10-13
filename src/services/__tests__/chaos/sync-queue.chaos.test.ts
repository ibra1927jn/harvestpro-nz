/**
 * Caos de la cola genérica (sync.service): peticiones de transporte, fichajes y
 * aprobaciones de horas con la red cayéndose, timeouts después de que el
 * servidor ya guardó, 503, errores permanentes, un elemento "venenoso" y dos
 * pestañas.
 *
 * Real: sync.service, Dexie (fake-indexeddb), processTransport (hasta el
 * repositorio). Simulado: el servidor (FakeBackend).
 *
 * Invariantes al final (red de vuelta, sin fallos):
 *  1. nada se aplica dos veces en el servidor (dos camiones por una petición);
 *  2. cada elemento está aplicado o en la dead letter queue con motivo;
 *  3. la cola queda vacía en un número acotado de pasadas;
 *  4. un elemento que no se puede subir no bloquea a los de detrás.
 *
 * CHAOS_SEED / CHAOS_RUNS como en bucket-pipeline.chaos.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

type Fault = 'ok' | 'networkBefore' | 'lostResponse' | 'http503' | 'permanent';

class FakeBackend {
    applied = new Map<string, number>();
    /** Orden en que llegan las acciones al servidor */
    log: string[] = [];
    faults: Fault[] = [];
    /** Claves que fallan siempre con un error de la app que menciona "fetch" */
    poison = new Set<string>();

    /**
     * idempotent: repetirlo no cambia nada (fichaje: manage-attendance devuelve
     * already_checked_in; aprobar horas). uniqueId: insert con id del cliente.
     */
    async call(key: string, opts: { idempotent?: boolean; uniqueId?: string } = {}): Promise<{ error: string | null }> {
        const { idempotent, uniqueId } = opts;
        await Promise.resolve();
        if (this.poison.has(key)) return { error: 'Failed to fetch roster for orchard' };
        const fault = this.faults.shift() ?? 'ok';
        if (fault === 'networkBefore') return { error: 'TypeError: Failed to fetch' };
        if (fault === 'http503') return { error: 'upstream connect error (503)' };
        if (fault === 'permanent') return { error: 'new row violates check constraint (23514)' };
        if (uniqueId && this.applied.has(key)) {
            return { error: 'duplicate key value violates unique constraint "transport_requests_pkey"' };
        }
        if (!(idempotent && this.applied.has(key))) this.applied.set(key, (this.applied.get(key) ?? 0) + 1);
        if (fault === 'lostResponse') return { error: 'TypeError: Failed to fetch' };
        return { error: null };
    }
}

const backend = new FakeBackend();

vi.mock('@/repositories/index', async importOriginal => {
    const actual = await importOriginal<typeof import('@/repositories/index')>();
    return {
        ...actual,
        transportRequestRepo: {
            create: async (row: { zone: string; id?: string }) => {
                const { error } = await backend.call(`transport:${row.zone}`, { uniqueId: row.id });
                return { data: error ? null : row, error };
            },
            update: async (id: string) => {
                const { error } = await backend.call(`transport-update:${id}`, { idempotent: true });
                return { data: error ? null : { id }, error };
            },
        },
    };
});
vi.mock('../../sync-processors', async importOriginal => {
    const actual = await importOriginal<typeof import('../../sync-processors')>();
    const viaBackend = (key: string) => async () => {
        const { error } = await backend.call(key, { idempotent: true });
        if (error) throw new Error(error);
    };
    return {
        ...actual,
        processAttendance: (p: { picker_id: string }) => viaBackend(`attendance:${p.picker_id}`)(),
        processTimesheet: (p: { attendanceId: string; action: string }) => {
            backend.log.push(`${p.action}:${p.attendanceId}`);
            return viaBackend(`timesheet:${p.attendanceId}`)();
        },
    };
});
vi.mock('../../conflict.service', () => ({ conflictService: { detect: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackSync: vi.fn(), trackDLQError: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { db } from '../../db';
import { syncService } from '../../sync.service';
import { createTransportRequest } from '../../logistics-dept.service';

type Action =
    | { kind: 'transport'; n: number }
    | { kind: 'checkIn'; n: number }
    | { kind: 'approve'; n: number }
    | { kind: 'poisonItem'; n: number }
    | { kind: 'offline' }
    | { kind: 'online' }
    | { kind: 'process'; faults: Fault[] }
    | { kind: 'twoTabs'; faults: Fault[] };

const faultArb = fc.constantFrom<Fault>('ok', 'ok', 'networkBefore', 'lostResponse', 'http503');
const actionArb: fc.Arbitrary<Action> = fc.oneof(
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('transport' as const), n: fc.integer({ min: 0, max: 999 }) }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('checkIn' as const), n: fc.integer({ min: 0, max: 999 }) }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('approve' as const), n: fc.integer({ min: 0, max: 999 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('poisonItem' as const), n: fc.constant(0) }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'offline' as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'online' as const }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('process' as const), faults: fc.array(faultArb, { maxLength: 4 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('twoTabs' as const), faults: fc.array(faultArb, { maxLength: 4 }) }) },
);

let online = true;
let seq = 0;

async function enqueue(a: Action, keys: string[]): Promise<void> {
    seq++;
    switch (a.kind) {
        case 'transport': {
            const zone = `Row ${a.n}-${seq}`;
            await createTransportRequest({
                orchard_id: 'o1', requested_by: 'r1', requester_name: 'Runner', zone,
                bins_count: 1, priority: 'normal', notes: '',
            });
            keys.push(`transport:${zone}`);
            break;
        }
        case 'checkIn':
            await syncService.addToQueue('ATTENDANCE', { picker_id: `p${a.n}-${seq}`, orchard_id: 'o1', verifiedBy: 'tl1' } as never);
            keys.push(`attendance:p${a.n}-${seq}`);
            break;
        case 'approve':
            await syncService.addToQueue('TIMESHEET', { action: 'approve', attendanceId: `a${a.n}-${seq}`, verifiedBy: 'hr' }, '2026-10-13T00:00:00Z');
            keys.push(`timesheet:a${a.n}-${seq}`);
            break;
        case 'poisonItem':
            backend.poison.add(`attendance:poison${seq}`);
            await syncService.addToQueue('ATTENDANCE', { picker_id: `poison${seq}`, orchard_id: 'o1', verifiedBy: 'tl1' } as never);
            keys.push(`attendance:poison${seq}`);
            break;
        default:
            break;
    }
}

async function run(actions: Action[]): Promise<void> {
    const keys: string[] = [];
    for (const a of actions) {
        switch (a.kind) {
            case 'offline': online = false; break;
            case 'online': online = true; break;
            case 'process':
                backend.faults.push(...a.faults);
                await syncService.processQueue();
                break;
            case 'twoTabs':
                backend.faults.push(...a.faults);
                // Dos pestañas: el mutex de Web Locks (si existe) o el flag local
                await Promise.all([syncService.processQueue(), syncService.processQueue()]);
                break;
            default:
                await enqueue(a, keys);
        }
    }
    // addToQueue dispara processQueue sin esperar: dejar que termine
    await new Promise(r => setTimeout(r, 0));

    online = true;
    backend.faults = [];
    let passes = 0;
    for (; passes < 250 && (await db.sync_queue.count()) > 0; passes++) {
        await syncService.processQueue();
    }
    expect(await db.sync_queue.count(), `queue not drained after ${passes} passes`).toBe(0);

    const dlq = new Map((await db.dead_letter_queue.toArray()).map(d => [d.id, d]));
    const dlqKeys = new Set(
        [...dlq.values()].map(d => {
            const p = d.payload as Record<string, string>;
            if (d.type === 'TRANSPORT') return `transport:${p.zone}`;
            if (d.type === 'ATTENDANCE') return `attendance:${p.picker_id}`;
            return `timesheet:${p.attendanceId}`;
        })
    );
    for (const k of keys) {
        const n = backend.applied.get(k) ?? 0;
        expect(n, `${k} applied ${n} times`).toBeLessThanOrEqual(1);
        expect(n === 1 || dlqKeys.has(k), `${k} neither applied nor in the dead letter queue`).toBe(true);
    }
    for (const d of dlq.values()) expect(d.failureReason).toBeTruthy();
}

const RUNS = Number(process.env.CHAOS_RUNS ?? 25);
const SEED = process.env.CHAOS_SEED ? Number(process.env.CHAOS_SEED) : 20261013;

beforeEach(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});
afterEach(() => { vi.useRealTimers(); });

async function reset(): Promise<void> {
    // Esperar a los processQueue en segundo plano de la ejecución anterior
    await new Promise(r => setTimeout(r, 0));
    await db.sync_queue.clear();
    await db.dead_letter_queue.clear();
    backend.applied.clear();
    backend.poison.clear();
    backend.log = [];
    backend.faults = [];
    online = true;
}

describe('sync queue chaos', () => {
    it(`each item applied at most once and applied-or-dead-lettered (seed ${SEED}, ${RUNS} runs)`, async () => {
        await fc.assert(
            fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 30 }), async actions => {
                await reset();
                // Sin red al encolar: así el orden lo deciden las acciones
                online = false;
                await run([{ kind: 'offline' }, ...actions]);
            }),
            { seed: SEED, numRuns: RUNS, endOnFailure: true }
        );
    }, Math.max(120_000, RUNS * 8_000));

    it('a transport request whose response was lost is not created twice', async () => {
        await reset();
        online = false;
        await run([{ kind: 'transport', n: 1 }, { kind: 'online' }, { kind: 'process', faults: ['lostResponse'] }]);
        expect([...backend.applied.entries()].filter(([k]) => k.startsWith('transport:')).map(([, n]) => n)).toEqual([1]);
    });

    it('an item that keeps failing with a "fetch" message does not block the queue forever', async () => {
        await reset();
        online = false;
        await run([{ kind: 'poisonItem', n: 0 }, { kind: 'transport', n: 2 }, { kind: 'online' }]);
        expect(backend.applied.get(`transport:Row 2-${seq}`)).toBe(1);
    });

    it('an item of a type this version cannot process goes to the dead letter queue with the reason', async () => {
        await reset();
        // Cola escrita por otra versión de la app (o dato corrupto)
        await db.sync_queue.put({
            id: 'legacy-1', type: 'BREAK_LOG' as never, payload: { picker_id: 'p1' }, timestamp: 1, retryCount: 0,
        });
        await run([{ kind: 'transport', n: 3 }, { kind: 'online' }]);
        const dead = await db.dead_letter_queue.get('legacy-1');
        expect(dead, 'unknown item was deleted without a trace').toBeDefined();
        expect(dead?.failureReason).toContain('BREAK_LOG');
        expect(dead?.payload).toEqual({ picker_id: 'p1' });
        // Lo de detrás sigue su camino
        expect(backend.applied.get(`transport:Row 3-${seq}`)).toBe(1);
    });

    it('offline actions reach the server in the order they were made', async () => {
        await reset();
        online = false;
        // HR aprueba, se da cuenta y rechaza; luego aprueba otra: sin red
        for (const [action, id] of [['approve', 'a1'], ['reject', 'a1'], ['approve', 'a2'], ['reject', 'a2'], ['approve', 'a2']] as const) {
            await syncService.addToQueue('TIMESHEET', { action, attendanceId: id, verifiedBy: 'hr' }, '2026-10-13T00:00:00Z');
        }
        online = true;
        await syncService.processQueue();
        expect(backend.log).toEqual(['approve:a1', 'reject:a1', 'approve:a2', 'reject:a2', 'approve:a2']);
    });

    it('retries on its own after a server error while online (no other trigger needed)', async () => {
        await reset();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
        online = false;
        await syncService.addToQueue('TIMESHEET', { action: 'approve', attendanceId: 'late', verifiedBy: 'hr' }, '2026-10-13T00:00:00Z');
        online = true;
        backend.faults = ['http503'];
        await syncService.processQueue();
        expect(await db.sync_queue.count()).toBe(1);
        // Nadie vuelve a llamar: ni evento online, ni encolar, ni botón
        await vi.advanceTimersByTimeAsync(16_000);
        for (let i = 0; i < 20 && (await db.sync_queue.count()) > 0; i++) await vi.advanceTimersByTimeAsync(50);
        expect(await db.sync_queue.count()).toBe(0);
        expect(backend.applied.get('timesheet:late')).toBe(1);
    });
});
