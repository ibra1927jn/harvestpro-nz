/**
 * Lógica pura de las pestañas de nómina.
 * @module components/views/payroll/payrollTabsLogic
 */

/** Hora local de NZ (HH:MM) o el texto alternativo si no hay marca */
export function nzClock(iso: string | null | undefined, fallback: string): string {
    if (!iso) return fallback;
    return new Date(iso).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' });
}

/** Calculadora rápida: el complemento solo cubre lo que falta hasta el mínimo */
export function quickWage(
    buckets: number,
    hours: number,
    rates: { bucket_rate: number; min_wage_rate: number }
): { pieceRate: number; minimumRequired: number; topUp: number; total: number } {
    const pieceRate = buckets * rates.bucket_rate;
    const minimumRequired = hours * rates.min_wage_rate;
    const topUp = Math.max(0, minimumRequired - pieceRate);
    return { pieceRate, minimumRequired, topUp, total: pieceRate + topUp };
}

/** Primeros `max` nombres separados por coma, con '…' si hay más */
export function namePreview(names: readonly string[], max = 6): string {
    return names.slice(0, max).join(', ') + (names.length > max ? '…' : '');
}
