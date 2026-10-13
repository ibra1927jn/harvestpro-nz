/**
 * Caos de la cola de cubetas: escaneos, cortes de red, timeouts, 5xx, lotes a
 * medias, recargas de la app, dos pestañas, relojes que saltan, token caducado
 * y cierre de la semana de pago con escaneos en cola.
 *
 * Piezas reales: store (addBucket / markAsSynced / markAsFailed), offlineService,
 * Dexie (fake-indexeddb), cifrado (Web Crypto) y bucket-upload.service.
 * Simulado: el servidor record-bucket (FakeServer, misma semántica: id del
 * móvil = idempotencia, día/semana cerrados se comprueban ANTES que la clave).
 *
 * Invariantes al final (red de vuelta, sin fallos):
 *  1. cada escaneo está exactamente una vez en el servidor, o apartado como
 *     fallido con su motivo (nunca las dos cosas, nunca ninguna);
 *  2. el servidor no tiene nada que no se escaneó y nadie se guardó dos veces;
 *  3. el contador de pendientes (Dexie) es 0 y el store no tiene nada colgado;
 *  4. la cola se vacía en un número acotado de pasadas (sin bucles infinitos);
 *  5. tras recargar, lo cifrado (scanned_by) se descifra;
 *  6. solo se rechaza lo que cae en la semana cerrada.
 *
 * Determinista con semilla: CHAOS_SEED=<n>. CHAOS_RUNS=<n> para la versión larga
 * (npm run test:chaos).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

type Scan = { id: string; picker_id: string; orchard_id: string; scanned_at: string; clock_skew_ms?: number };
type Result = { id: string | null; status: 'saved' | 'duplicate' | 'rejected' | 'retry'; reason?: string };
type Fault = 'ok' | 'networkBefore' | 'timeoutAfter' | 'http503' | 'partial' | 'truncated' | 'authExpired';

/** record-bucket en memoria con fallos inyectables */
class FakeServer {
    rows = new Map<string, Scan>();
    saves = new Map<string, number>();
    rejected = new Map<string, string>();
    closedBefore: number | null = null;
    faults: Fault[] = [];
    calls = 0;
    /** Reloj del servidor − reloj del móvil (ms); null = no manda server_time (versión anterior) */
    serverOffset: number | null = null;
    lastClientNow: unknown = undefined;

    private apply(s: Scan): Result {
        // Igual que en la BD: el trigger de semana cerrada va antes que la clave
        if (this.closedBefore !== null && Date.parse(s.scanned_at) < this.closedBefore) {
            if (this.rows.has(s.id)) return { id: s.id, status: 'duplicate' }; // record-bucket comprueba el id
            this.rejected.set(s.id, 'PAY_WEEK_CLOSED');
            return { id: s.id, status: 'rejected', reason: 'PAY_WEEK_CLOSED: the pay week of this bucket is closed.' };
        }
        if (this.rows.has(s.id)) return { id: s.id, status: 'duplicate' };
        this.rows.set(s.id, s);
        this.saves.set(s.id, (this.saves.get(s.id) ?? 0) + 1);
        return { id: s.id, status: 'saved' };
    }

    async handle(body: { scans: Scan[]; client_now?: number }): Promise<{ data: { results: Result[]; server_time?: string }; error: null }> {
        this.calls++;
        this.lastClientNow = body.client_now;
        const serverTime = this.serverOffset === null ? {} : { server_time: new Date(Date.now() + this.serverOffset).toISOString() };
        await Promise.resolve();
        const fault = this.faults.shift() ?? 'ok';
        const scans = body.scans;
        switch (fault) {
            case 'networkBefore':
                throw new TypeError('Failed to fetch');
            case 'http503':
                throw new Error('Edge Function returned a non-2xx status code (503)');
            case 'authExpired':
                throw Object.assign(new Error('JWT expired'), { status: 401 });
            case 'timeoutAfter':
                scans.forEach(s => this.apply(s));
                throw new Error('Request timeout after 30000ms');
            case 'partial': {
                // La BD cae a mitad de lote: lo primero se guarda, el resto "retry"
                const k = Math.floor(scans.length / 2);
                return { data: { results: scans.map((s, i) => (i < k ? this.apply(s) : { id: s.id, status: 'retry' as const, reason: 'connection reset' })), ...serverTime }, error: null };
            }
            case 'truncated': {
                // Se guarda todo pero la respuesta llega cortada
                const results = scans.map(s => this.apply(s));
                return { data: { results: results.slice(0, Math.floor(results.length / 2)), ...serverTime }, error: null };
            }
            default:
                return { data: { results: scans.map(s => this.apply(s)), ...serverTime }, error: null };
        }
    }
}

const server = new FakeServer();

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: {
        invoke: (_fn: string, body: { scans: Scan[] }) => server.handle(body),
    },
}));
vi.mock('@/services/audit.service', () => ({ auditService: { logAudit: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackBucketScanned: vi.fn() } }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { useHarvestStore } from '@/stores/useHarvestStore';
import { hydrateFromDexie } from '@/stores/storeSync';
import { uploadPendingBuckets } from '../../bucket-upload.service';
import { offlineService } from '../../offline.service';
import { db } from '../../db';
import { decryptRecord, resetKeyCache } from '../../dbCrypto';
import { nowNZST } from '@/utils/nzst';

const ORCHARD = '11111111-1111-4111-8111-111111111111';
const RUNNER = '22222222-2222-4222-8222-222222222222';
const PICKERS = ['LOC-001', 'LOC-002', 'LOC-003'];
const START = Date.parse('2026-10-12T22:00:00Z'); // 11:00 NZDT

type Action =
    | { kind: 'scan'; picker: number; times: number }
    | { kind: 'tick'; ms: number }
    | { kind: 'offline' }
    | { kind: 'online' }
    | { kind: 'upload'; faults: Fault[] }
    | { kind: 'twoTabs'; faults: Fault[] }
    | { kind: 'reload' }
    | { kind: 'kill' }
    | { kind: 'closePayWeek' };

const faultArb = fc.constantFrom<Fault>('ok', 'ok', 'networkBefore', 'timeoutAfter', 'http503', 'partial', 'truncated', 'authExpired');
const actionArb: fc.Arbitrary<Action> = fc.oneof(
    { weight: 6, arbitrary: fc.record({ kind: fc.constant('scan' as const), picker: fc.integer({ min: 0, max: 2 }), times: fc.integer({ min: 1, max: 3 }) }) },
    // Segundos normales, y saltos del reloj del móvil (horas, hacia atrás, DST)
    { weight: 3, arbitrary: fc.record({ kind: fc.constant('tick' as const), ms: fc.oneof(fc.integer({ min: 0, max: 3_000 }), fc.constantFrom(3_600_000, -3_600_000, -5 * 3_600_000, 26 * 3_600_000)) }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'offline' as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'online' as const }) },
    { weight: 4, arbitrary: fc.record({ kind: fc.constant('upload' as const), faults: fc.array(faultArb, { maxLength: 3 }) }) },
    { weight: 1, arbitrary: fc.record({ kind: fc.constant('twoTabs' as const), faults: fc.array(faultArb, { maxLength: 2 }) }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'reload' as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'kill' as const }) },
    { weight: 1, arbitrary: fc.constant({ kind: 'closePayWeek' as const }) },
);

let online = true;
let clock = START;

/** Espera a que las escrituras en curso en IndexedDB terminen (la app no muere a mitad) */
async function settle(): Promise<void> {
    for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 0));
    }
    const ids = useHarvestStore.getState().buckets.map(b => b.id);
    for (let i = 0; i < 200; i++) {
        const stored = await db.bucket_queue.where('id').anyOf(ids).count();
        if (stored === ids.length) return;
        await new Promise(r => setTimeout(r, 5));
    }
}

async function reload(): Promise<void> {
    await settle();
    // Memoria fuera: store vacío y clave sin derivar; IndexedDB intacta
    useHarvestStore.setState({ buckets: [] });
    resetKeyCache();
    await hydrateFromDexie(useHarvestStore.setState);
}

/**
 * La app muere de golpe (Android la mata, batería): lo que estaba en vuelo NO
 * llega a IndexedDB (se cierra la BD antes de que termine), la memoria se
 * pierde, y al reabrir se lee lo que hay en IndexedDB.
 */
async function kill(): Promise<void> {
    const ids = useHarvestStore.getState().buckets.map(b => b.id);
    db.close();
    await Promise.all(ids.map(id => offlineService.whenWritten(id)));
    for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
    useHarvestStore.setState({ buckets: [] });
    resetKeyCache();
    await db.open();
    await hydrateFromDexie(useHarvestStore.setState);
}

/** Escanea como la pantalla del runner: cuenta solo lo que se le confirmó ("Saved") */
async function scanConfirmed(picker: number): Promise<string | null> {
    const saved = useHarvestStore.getState().addBucket({
        picker_id: PICKERS[picker],
        quality_grade: 'A',
        timestamp: nowNZST(),
        orchard_id: ORCHARD,
    });
    const id = useHarvestStore.getState().buckets[0].id;
    // (la versión anterior no devolvía nada y la pantalla decía "Saved" al momento)
    return (await saved) === false ? null : id;
}

async function run(actions: Action[]): Promise<void> {
    const scanned: string[] = [];

    for (const a of actions) {
        switch (a.kind) {
            case 'scan':
                for (let i = 0; i < a.times; i++) {
                    const id = await scanConfirmed(a.picker);
                    expect(id, 'scan not confirmed').not.toBeNull();
                    if (id) scanned.push(id);
                }
                break;
            case 'tick':
                clock += a.ms;
                vi.setSystemTime(clock);
                break;
            case 'offline':
                online = false;
                break;
            case 'online':
                online = true;
                break;
            case 'upload':
                server.faults.push(...a.faults);
                await uploadPendingBuckets().catch(() => undefined);
                break;
            case 'twoTabs':
                server.faults.push(...a.faults);
                await Promise.all([uploadPendingBuckets().catch(() => undefined), uploadPendingBuckets().catch(() => undefined)]);
                break;
            case 'reload':
                await reload();
                break;
            case 'kill':
                await kill();
                break;
            case 'closePayWeek':
                // Payroll cierra: todo lo escaneado hasta ahora (hora del móvil) queda fuera
                server.closedBefore = clock + 1;
                break;
        }
    }

    // ── Vuelve la red y se drena ──
    online = true;
    server.faults = [];
    let passes = 0;
    for (; passes < 10; passes++) {
        await settle();
        const outcome = await uploadPendingBuckets();
        if (outcome === 'idle') break;
    }
    expect(passes, 'queue did not drain (retry loop)').toBeLessThan(10);
    await settle();

    // 3. Nada pendiente ni en el store ni en Dexie
    const stuck = useHarvestStore.getState().buckets.filter(b => !b.synced && !b.failed).map(b => b.id);
    expect(stuck, 'store still has pending scans').toEqual([]);
    expect(await offlineService.getPendingCount(), 'pending counter after drain').toBe(0);

    // Recarga final: lo fallido sigue a la vista con su motivo y se descifra
    await reload();
    const failedRows = await db.bucket_queue.where('synced').equals(-1).toArray();
    const failed = new Map(failedRows.map(r => [r.id, r]));

    // 1. Exactamente uno de: en el servidor / fallido con motivo
    for (const id of scanned) {
        const onServer = server.rows.has(id);
        const isFailed = failed.has(id);
        expect(onServer !== isFailed, `scan ${id}: onServer=${onServer} failed=${isFailed}`).toBe(true);
        if (isFailed) expect(failed.get(id)?.failure_reason, `scan ${id} failed without reason`).toBeTruthy();
    }
    // 2. Nada inventado ni guardado dos veces
    expect([...server.rows.keys()].every(id => scanned.includes(id))).toBe(true);
    for (const [id, n] of server.saves) expect(n, `scan ${id} saved ${n} times`).toBe(1);
    // 6. Solo se rechaza lo de la semana cerrada
    for (const id of failed.keys()) expect(server.rejected.has(id), `scan ${id} failed but the server never rejected it`).toBe(true);
    // 5. El cifrado sobrevive a la recarga
    for (const row of await db.bucket_queue.toArray()) {
        const plain = await decryptRecord('bucket_queue', row as unknown as Record<string, unknown>);
        expect(plain.scanned_by).toBe(RUNNER);
    }
}

const RUNS = Number(process.env.CHAOS_RUNS ?? 25);
const SEED = process.env.CHAOS_SEED ? Number(process.env.CHAOS_SEED) : 20261013;

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
});
afterEach(() => {
    vi.useRealTimers();
});

async function reset(): Promise<void> {
    await db.bucket_queue.clear();
    await db.sync_meta.clear();
    resetKeyCache();
    useHarvestStore.setState({ buckets: [], crew: [], clockSkew: 0, currentUser: { id: RUNNER } as never });
    server.rows.clear();
    server.saves.clear();
    server.rejected.clear();
    server.closedBefore = null;
    server.faults = [];
    server.serverOffset = null;
    online = true;
    clock = START;
    vi.setSystemTime(clock);
}

describe('bucket pipeline chaos', () => {
    it(`every scan ends exactly once on the server or visibly failed (seed ${SEED}, ${RUNS} runs)`, async () => {
        await fc.assert(
            fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 40 }), async actions => {
                await reset();
                await run(actions);
            }),
            { seed: SEED, numRuns: RUNS, endOnFailure: true }
        );
    }, Math.max(120_000, RUNS * 3_000));

    it('scan confirmed by the server before its IndexedDB write landed does not stay "pending" forever', async () => {
        await reset();
        // Primer escaneo tras abrir la app: derivar la clave tarda y la subida
        // (servidor rápido) responde antes de que el registro esté en IndexedDB
        await run([{ kind: 'scan', picker: 0, times: 1 }, { kind: 'upload', faults: [] }]);
        expect(server.rows.size).toBe(1);
    });

    it('a scan the runner was told is saved survives the app being killed right after (first scan after start)', async () => {
        await reset();
        // Clave sin derivar (app recién abierta): cifrar el primer escaneo tarda.
        // Antes "Saved" salía antes de la escritura y matar la app la perdía.
        await run([{ kind: 'offline' }, { kind: 'scan', picker: 1, times: 1 }, { kind: 'kill' }]);
        expect(server.rows.size, 'confirmed scan lost after kill').toBe(1);
    });

    it('the phone clock offset is measured on upload and corrects later scans (sent with the correction)', async () => {
        await reset();
        // Reloj del móvil 30 min atrasado. Antes clockSkew no se medía nunca
        server.serverOffset = 30 * 60_000;
        await run([{ kind: 'scan', picker: 0, times: 1 }, { kind: 'upload', faults: [] }]);
        expect(server.lastClientNow, 'client_now not sent').toBe(clock);
        expect(useHarvestStore.getState().clockSkew).toBe(30 * 60_000);

        const id = await scanConfirmed(1);
        await uploadPendingBuckets();
        const latest = server.rows.get(id!);
        expect(Date.parse(latest!.scanned_at)).toBe(clock + 30 * 60_000);
        expect(latest!.clock_skew_ms).toBe(30 * 60_000);
    });

    it('two buckets of the same person in the same second are two scans', async () => {
        await reset();
        await run([{ kind: 'scan', picker: 0, times: 2 }, { kind: 'upload', faults: [] }]);
        expect(server.rows.size).toBe(2);
    });
});
