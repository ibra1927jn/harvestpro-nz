/**
 * useQcAlerts — avisos de calidad (rechazo o criterio «mal») para la campana
 * del team leader y del manager, y las inspecciones de hoy de su ámbito.
 *
 * Fuente: las inspecciones de hoy del huerto (una consulta por huerto y día,
 * compartida por todos los componentes) + las que llegan en vivo por el canal
 * del huerto (storeSync → recentQcInspections). «Visto» se guarda en este
 * dispositivo (localStorage), por usuario.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { useAuth } from '@/context/AuthContext';
import type { QCInspection } from '@/services/qc.service';
import {
    buildQcAlerts,
    countUnseen,
    mergeInspections,
    receivesQcAlerts,
    scopeInspections,
    type QcAlert,
    type QcInspectionLike,
} from '@/services/qcAlerts';
import { todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';

/* ── Inspecciones de hoy (caché compartida) ─────────── */

/** Cada cuánto, como mucho, se vuelve a pedir la lista del día (el resto llega en vivo) */
export const QC_TODAY_REFRESH_MS = 5 * 60_000;

const todayCache = new Map<string, { at: number; data: QCInspection[]; pending?: Promise<QCInspection[]> }>();

async function loadToday(orchardId: string, day: string): Promise<QCInspection[]> {
    const key = `${orchardId}|${day}`;
    const hit = todayCache.get(key);
    if (hit?.pending) return hit.pending;
    if (hit && Date.now() - hit.at < QC_TODAY_REFRESH_MS) return hit.data;
    // Import diferido: la campana va en la cabecera de todas las páginas y no
    // debe arrastrar el servicio de QC (ni zod) al bundle inicial
    const pending = import('@/services/qc.service').then(m => m.qcService.getInspections(orchardId, day)).then(
        data => { todayCache.set(key, { at: Date.now(), data }); return data; },
        (e: unknown) => { todayCache.delete(key); throw e; },
    );
    todayCache.set(key, { at: hit?.at ?? 0, data: hit?.data ?? [], pending });
    return pending;
}

/** Solo para tests */
export function __resetQcTodayCache(): void {
    todayCache.clear();
}

/* ── Vistos (por usuario, en este dispositivo) ──────── */

const SEEN_MAX = 300;
const seenListeners = new Set<() => void>();
const seenSnapshots = new Map<string, ReadonlySet<string>>();
const EMPTY: ReadonlySet<string> = new Set();

const seenKey = (userId: string) => `harvestpro_qc_alerts_seen_${userId}`;

function readSeen(userId: string | undefined): ReadonlySet<string> {
    if (!userId) return EMPTY;
    const cached = seenSnapshots.get(userId);
    if (cached) return cached;
    let ids: string[] = [];
    try {
        const raw = localStorage.getItem(seenKey(userId));
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
        ids = [];
    }
    const set: ReadonlySet<string> = new Set(ids);
    seenSnapshots.set(userId, set);
    return set;
}

export function markQcAlertsSeen(userId: string | undefined, ids: ReadonlyArray<string>): void {
    if (!userId || ids.length === 0) return;
    const prev = readSeen(userId);
    if (ids.every(id => prev.has(id))) return;
    const next = [...prev, ...ids.filter(id => !prev.has(id))].slice(-SEEN_MAX);
    try {
        localStorage.setItem(seenKey(userId), JSON.stringify(next));
    } catch {
        // Sin almacenamiento: queda visto solo en esta sesión
    }
    seenSnapshots.set(userId, new Set(next));
    seenListeners.forEach(l => l());
}

function subscribeSeen(listener: () => void): () => void {
    seenListeners.add(listener);
    return () => { seenListeners.delete(listener); };
}

/* ── Hook ───────────────────────────────────────────── */

export interface UseQcAlertsResult {
    /** ¿Este rol recibe avisos de calidad? (team leader, manager, admin) */
    enabled: boolean;
    alerts: QcAlert[];
    unseenCount: number;
    seen: ReadonlySet<string>;
    /** Inspecciones de hoy del ámbito de quien mira (su equipo o el huerto) */
    todayInspections: QCInspection[];
    markSeen: (ids: ReadonlyArray<string>) => void;
    markAllSeen: () => void;
}

export function useQcAlerts(): UseQcAlertsResult {
    const { appUser } = useAuth();
    const orchardId = useHarvestStore(s => s.orchard?.id);
    const storeCrew = useHarvestStore(s => s.crew);
    const storeLive = useHarvestStore(s => s.recentQcInspections);
    // Los tests (y un store aún sin hidratar) pueden no traerlas
    const crew = useMemo(() => (Array.isArray(storeCrew) ? storeCrew : []), [storeCrew]);
    const live = useMemo(() => (Array.isArray(storeLive) ? storeLive : []), [storeLive]);
    const role = appUser?.role;
    const userId = appUser?.id;
    const enabled = receivesQcAlerts(role);
    // Solo los roles con avisos miran la fecha (el resto no hace nada aquí)
    const day = enabled ? todayNZST() : '';

    const [fetched, setFetched] = useState<QCInspection[]>([]);
    useEffect(() => {
        if (!enabled || !orchardId) return;
        let cancelled = false;
        const run = () => {
            loadToday(orchardId, day)
                .then(data => { if (!cancelled) setFetched(data); })
                .catch(e => logger.warn('[useQcAlerts] could not load today inspections:', e));
        };
        run();
        // Al volver a la pestaña: ponerse al día (la caché limita a una consulta cada 5 min)
        const onVisible = () => { if (!document.hidden) run(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled, orchardId, day]);

    const todayInspections = useMemo(() => {
        if (!enabled) return [];
        // Las que llegan en vivo pueden ser de ayer si la app quedó abierta a medianoche
        const liveToday = (live as unknown as QcInspectionLike[]).filter(
            i => typeof i?.created_at === 'string' && new Date(i.created_at).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }) === day,
        ) as unknown as QCInspection[];
        const all = mergeInspections<QCInspection>(liveToday, fetched);
        return scopeInspections({ inspections: all, crew, role, userId });
    }, [enabled, live, fetched, crew, role, userId, day]);

    const alerts = useMemo(
        () => (enabled ? buildQcAlerts({ inspections: todayInspections, crew, role, userId }) : []),
        [enabled, todayInspections, crew, role, userId],
    );

    const seen = useSyncExternalStore(subscribeSeen, () => readSeen(userId), () => EMPTY);
    const unseenCount = useMemo(() => countUnseen(alerts, seen), [alerts, seen]);

    const markSeen = useCallback((ids: ReadonlyArray<string>) => markQcAlertsSeen(userId, ids), [userId]);
    const markAllSeen = useCallback(() => markQcAlertsSeen(userId, alerts.map(a => a.id)), [userId, alerts]);

    return { enabled, alerts, unseenCount, seen, todayInspections, markSeen, markAllSeen };
}
