/**
 * Fixtures para tests de integración: convierte una ficha de prueba con
 * `hours` (horas pagables) y `total_buckets_today` en lo que hay de verdad en
 * la base de datos — fichaje de entrada/salida y escaneos de cubetas — que es
 * de donde el cálculo único (harvestMetrics/pay.ts) saca horas y cubetas.
 */
type CrewFixture = Record<string, unknown> & { id: string; hours?: number; total_buckets_today?: number };

export function asShiftData<T extends CrewFixture>(crew: T[], now: Date = new Date()) {
    const nowMs = now.getTime();
    const bucketRecords: Record<string, unknown>[] = [];
    const withShifts = crew.map(p => {
        const hours = p.hours ?? 0;
        for (let i = 0; i < (p.total_buckets_today ?? 0); i++) {
            const ts = new Date(nowMs - 60_000).toISOString();
            bucketRecords.push({ id: `${p.id}-b${i}`, picker_id: p.id, bin_id: '', timestamp: ts, scanned_at: ts, quality_grade: 'A' });
        }
        if (hours <= 0) return p;
        // Turnos de más de 4 h: el team leader anota 30 min de descanso no
        // pagado (solo se descuenta el descanso anotado)
        const withBreak = hours > 4;
        const gross = withBreak ? hours + 0.5 : hours;
        const checkInMs = nowMs - gross * 3_600_000;
        return {
            ...p,
            check_in: new Date(checkInMs).toISOString(),
            check_out: new Date(nowMs).toISOString(),
            ...(withBreak ? { break_start: new Date(checkInMs + 2 * 3_600_000).toISOString() } : {}),
        };
    });
    return { crew: withShifts, bucketRecords };
}
