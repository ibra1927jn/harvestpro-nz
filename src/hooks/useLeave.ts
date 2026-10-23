/**
 * useLeave — ausencias para el pase de lista, Equipos y Nómina, y las que pidió
 * el team leader (con las que siguen en la cola sin red).
 *
 * Sin React Query a propósito: estas pantallas (y sus tests) no siempre van
 * dentro del QueryClientProvider. Caché pequeña por clave, compartida entre
 * componentes, con una consulta cada 5 min como mucho. El servicio se importa
 * en diferido (no va en el bundle inicial).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LeaveRequest, QueuedLeaveRequest } from '@/services/leave.service';
import { leaveByPickerOn } from '@/services/leaveLogic';
import { addDaysYMD, todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';

/** Las ausencias cambian poco */
export const LEAVE_STALE_MS = 5 * 60_000;

const cache = new Map<string, { at: number; data: unknown; pending?: Promise<unknown> }>();
const listeners = new Set<() => void>();

async function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit?.pending) return hit.pending as Promise<T>;
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.data as T;
    const pending = load().then(
        data => { cache.set(key, { at: Date.now(), data }); return data; },
        (e: unknown) => { cache.delete(key); throw e; },
    );
    cache.set(key, { at: hit?.at ?? 0, data: hit?.data, pending });
    return pending;
}

/** Tras pedir una ausencia: se vuelve a leer todo lo de ausencias */
export function invalidateLeave(): void {
    cache.clear();
    listeners.forEach(l => l());
}

/** Solo para tests */
export function __resetLeaveCache(): void {
    cache.clear();
}

function useInvalidationTick(): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const l = () => setTick(n => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    return tick;
}

const EMPTY_LEAVES: LeaveRequest[] = [];

/** Ausencia aprobada de cada persona ese día (por defecto hoy) en el huerto */
export function useLeaveOnDay(orchardId: string | undefined, day?: string): Map<string, LeaveRequest> {
    const ymd = day ?? todayNZST();
    const tick = useInvalidationTick();
    const [leaves, setLeaves] = useState<LeaveRequest[]>(EMPTY_LEAVES);

    useEffect(() => {
        if (!orchardId) return;
        let cancelled = false;
        cached(`day|${orchardId}|${ymd}`, LEAVE_STALE_MS, async () => {
            const { leaveService } = await import('@/services/leave.service');
            return leaveService.listInRange(ymd, ymd, orchardId);
        })
            .then(data => { if (!cancelled) setLeaves(data); })
            .catch(e => logger.warn('[useLeaveOnDay] could not load leave:', e));
        return () => { cancelled = true; };
    }, [orchardId, ymd, tick]);

    return useMemo(() => leaveByPickerOn(leaves, ymd), [leaves, ymd]);
}

export type MyLeaveRequest =
    | { kind: 'server'; leave: LeaveRequest }
    | { kind: 'queued'; leave: QueuedLeaveRequest };

/** Lo que pidió el team leader (de los últimos 30 días en adelante) + lo que aún no subió */
export function useMyLeaveRequests(userId: string | undefined) {
    const tick = useInvalidationTick();
    const [items, setItems] = useState<MyLeaveRequest[]>([]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        cached(`mine|${userId}`, 60_000, async () => {
            const { leaveService } = await import('@/services/leave.service');
            const [server, queued] = await Promise.all([
                leaveService.listRequestedBy(userId, addDaysYMD(todayNZST(), -30)).catch(() => [] as LeaveRequest[]),
                leaveService.listQueued().catch(() => [] as QueuedLeaveRequest[]),
            ]);
            const serverIds = new Set(server.map(l => l.id));
            const list: MyLeaveRequest[] = [
                ...queued.filter(q => !serverIds.has(q.id)).map(q => ({ kind: 'queued' as const, leave: q })),
                ...server.map(l => ({ kind: 'server' as const, leave: l })),
            ];
            return list;
        })
            .then(data => { if (!cancelled) setItems(data); })
            .catch(e => logger.warn('[useMyLeaveRequests] could not load:', e));
        return () => { cancelled = true; };
    }, [userId, tick]);

    const refetch = useCallback(() => invalidateLeave(), []);
    return useMemo(() => ({ items, refetch }), [items, refetch]);
}
