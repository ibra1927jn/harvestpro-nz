/**
 * useAttendanceLiveRefresh — vuelve a pedir una pantalla (fichajes de nómina,
 * panel de nómina) cuando cambia daily_attendance en vivo o al volver a la
 * pestaña, sin pasar de una vez por minuto: recalcular la nómina es la
 * operación cara de la prueba de carga (docs/audits/2026-10-21-load-test.md).
 * Un cambio dentro del minuto no se pierde: se hace al acabar el minuto.
 */
import { useEffect, useRef } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';

export const LIVE_REFRESH_MIN_MS = 60_000;

export interface Throttle {
    /** Pide un refresco: ahora si pasó el mínimo, si no al cumplirse */
    request: () => void;
    cancel: () => void;
}

/**
 * Throttle con llamada final (lógica pura salvo los temporizadores).
 * Cuenta desde que se crea: la pantalla acaba de cargar sus datos.
 */
export function createThrottle(fn: () => void, minMs: number, now: () => number = Date.now): Throttle {
    let last = now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => { timer = null; last = now(); fn(); };
    return {
        request() {
            if (timer) return;
            const wait = last + minMs - now();
            if (wait <= 0) run();
            else timer = setTimeout(run, wait);
        },
        cancel() {
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}

export function useAttendanceLiveRefresh(
    refresh: () => void,
    opts: { enabled?: boolean; minIntervalMs?: number } = {},
): void {
    const { enabled = true, minIntervalMs = LIVE_REFRESH_MIN_MS } = opts;
    const changedAt = useHarvestStore(s => s.attendanceChangedAt);
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;
    const throttleRef = useRef<Throttle | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const th = createThrottle(() => refreshRef.current(), minIntervalMs);
        throttleRef.current = th;
        const onVisible = () => { if (!document.hidden) th.request(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            th.cancel();
            throttleRef.current = null;
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled, minIntervalMs]);

    useEffect(() => {
        if (enabled && changedAt) throttleRef.current?.request();
    }, [changedAt, enabled]);
}
