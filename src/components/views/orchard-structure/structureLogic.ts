/**
 * Lógica pura de «Estructura del huerto»: rangos de filas, errores de la base,
 * resumen de variedades y valores por defecto.
 * @module components/views/orchard-structure/structureLogic
 */
import type { BlockRow, OrchardRowRecord, SeasonRow } from '@/repositories/orchard-structure.repository';

export const MAX_ROW_NUMBER = 9999;
export const MAX_ROWS_AT_ONCE = 1000;

export type RangeResult =
    | { ok: true; from: number; to: number }
    | { ok: false; errorKey: string };

/** Valida «de la fila X a la Y» escrito en dos campos */
export function parseRowRange(fromText: string, toText: string): RangeResult {
    const from = Number(fromText.trim());
    const to = toText.trim() === '' ? from : Number(toText.trim());
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > MAX_ROW_NUMBER) {
        return { ok: false, errorKey: 'ostruct.err.range' };
    }
    if (to < from) return { ok: false, errorKey: 'ostruct.err.range_order' };
    if (to - from >= MAX_ROWS_AT_ONCE) return { ok: false, errorKey: 'ostruct.err.range_size' };
    return { ok: true, from, to };
}

/** Objetivo de cubetas por fila: vacío = sin cambio (null); si no, entero 0–10000 */
export function parseTarget(text: string): { ok: true; value: number | null } | { ok: false } {
    const s = text.trim();
    if (s === '') return { ok: true, value: null };
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 10000) return { ok: false };
    return { ok: true, value: n };
}

/** Variedad escrita: recortada, vacía = null */
export function cleanVariety(text: string): string | null {
    const v = text.trim();
    return v === '' ? null : v.slice(0, 60);
}

export interface StructureErrorView {
    key: string;
    params?: Record<string, string | number>;
}

/** Mensaje claro para los errores típicos de la base */
export function structureErrorView(err: unknown): StructureErrorView {
    const message = err instanceof Error ? err.message
        : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
    const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code ?? '') : '';
    const taken = /Row (\d+) is already in block (.+)$/.exec(message);
    if (taken) return { key: 'ostruct.err.row_taken', params: { row: Number(taken[1]), block: taken[2] } };
    if (/idx_unique_active_block/.test(message)) return { key: 'ostruct.err.block_exists' };
    if (/idx_one_active_season_per_orchard/.test(message)) return { key: 'ostruct.err.one_active' };
    if (/already has blocks/.test(message)) return { key: 'ostruct.err.copy_not_empty' };
    if (/dates_order/.test(message)) return { key: 'ostruct.err.dates' };
    if (code === '42501' || /row-level security|not allowed/i.test(message)) return { key: 'ostruct.err.not_allowed' };
    if (code === '22023' || code === '23514') return { key: 'ostruct.err.invalid' };
    if (/Failed to fetch|NetworkError|network/i.test(message)) return { key: 'ostruct.err.offline' };
    return { key: 'ostruct.err.generic', params: { error: message } };
}

/** «Royal Gala ×15 · Braeburn ×5 · sin variedad ×2», las más frecuentes primero */
export function varietySummary(rows: readonly Pick<OrchardRowRecord, 'variety'>[]): Array<{ variety: string | null; count: number }> {
    const counts = new Map<string, { variety: string | null; count: number }>();
    for (const r of rows) {
        const v = r.variety?.trim() || null;
        const key = (v ?? '').toLowerCase();
        const cur = counts.get(key);
        if (cur) cur.count++;
        else counts.set(key, { variety: v, count: 1 });
    }
    return [...counts.values()].sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        // Sin variedad, al final
        if (a.variety === null || b.variety === null) return a.variety === null ? (b.variety === null ? 0 : 1) : -1;
        return a.variety.localeCompare(b.variety);
    });
}

/** Primer número de fila libre tras los bloques de la temporada (para proponer el rango) */
export function nextFreeRow(blocks: readonly Pick<BlockRow, 'start_row' | 'total_rows'>[], rows: readonly Pick<OrchardRowRecord, 'row_number'>[]): number {
    let max = 0;
    for (const r of rows) max = Math.max(max, r.row_number);
    if (max === 0) for (const b of blocks) if (b.total_rows > 0) max = Math.max(max, b.start_row + b.total_rows - 1);
    return Math.min(max + 1, MAX_ROW_NUMBER);
}

/** Temporada que se enseña al abrir: la activa; si no, la más reciente */
export function defaultSeasonId(seasons: readonly SeasonRow[]): string | null {
    return seasons.find(s => s.status === 'active')?.id ?? seasons[0]?.id ?? null;
}

/**
 * Años de la temporada de cosecha que empieza en `today` (yyyy-mm-dd): en NZ la
 * fruta de verano va de octubre a abril, así que de julio en adelante es
 * «2026–27» y antes «2025–26».
 */
export function seasonYears(today: string): string {
    const [y, m] = today.split('-').map(Number);
    const start = m >= 7 ? y : y - 1;
    return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Rangos de filas consecutivas: [1,2,3,7,8] → «1–3, 7–8» */
export function compactRanges(numbers: readonly number[]): string {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const parts: string[] = [];
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
        parts.push(i === j ? String(sorted[i]) : `${sorted[i]}–${sorted[j]}`);
        i = j + 1;
    }
    return parts.join(', ');
}
