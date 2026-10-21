/**
 * inspectList — quién sale en la lista de «Paso 1: elige recolector» de Calidad
 * y en qué orden. Lógica pura (sin React) para poder probarla sola.
 *
 * Reglas:
 * - Solo pickers (rol picker o sin rol): fuera team leaders y runners.
 * - Fichados hoy primero; dentro de cada grupo por fila (sin fila al final) y nombre.
 * - «Ya inspeccionado hoy» = hay una inspección suya en las de hoy.
 */
import type { Picker } from '@/types';
import { isPresentToday, selectPickers } from '@/services/harvestMetrics/roster';

export interface InspectablePicker {
    picker: Picker;
    /** Fichado hoy y sin salida */
    present: boolean;
    /** Ya tiene una inspección hoy */
    inspected: boolean;
}

const rowOrder = (p: Picker): number => (p.current_row > 0 ? p.current_row : Number.MAX_SAFE_INTEGER);

export function orderForInspection(crew: Picker[], inspectedIds: ReadonlySet<string>): InspectablePicker[] {
    return selectPickers(crew)
        .map(picker => ({ picker, present: isPresentToday(picker), inspected: inspectedIds.has(picker.id) }))
        .sort((a, b) => {
            if (a.present !== b.present) return a.present ? -1 : 1;
            const byRow = rowOrder(a.picker) - rowOrder(b.picker);
            if (byRow !== 0) return byRow;
            return a.picker.name.localeCompare(b.picker.name);
        });
}

/** Búsqueda por nombre o ID de pegatina (sin distinguir mayúsculas) */
export function matchesInspectQuery(picker: Picker, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return picker.name.toLowerCase().includes(q) || picker.picker_id.toLowerCase().includes(q);
}

/**
 * Siguiente picker en modo Turbo: el próximo de la lista (dando la vuelta) que
 * todavía no se ha inspeccionado hoy; si ya están todos, el siguiente a secas.
 * null si no hay nadie más.
 */
export function nextForInspection(list: InspectablePicker[], currentId: string): Picker | null {
    if (list.length === 0) return null;
    const start = list.findIndex(e => e.picker.id === currentId);
    const others: InspectablePicker[] = [];
    for (let i = 1; i <= list.length; i++) {
        const entry = list[(start + i) % list.length];
        if (entry.picker.id !== currentId) others.push(entry);
    }
    if (others.length === 0) return null;
    return (others.find(e => !e.inspected) ?? others[0]).picker;
}
