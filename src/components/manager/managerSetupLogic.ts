/**
 * Lógica pura del asistente «Configura tu huerto» del manager (B4).
 * @module components/manager/managerSetupLogic
 */

/** Variedad más repetida de las filas de un bloque ('' si no hay ninguna conocida) */
export function dominantVariety(rowVarieties: Record<number, string>): string {
    const counts = new Map<string, number>();
    for (const v of Object.values(rowVarieties)) {
        const name = (v ?? '').trim();
        if (!name || name === 'Unknown' || name === 'Desconocida') continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    let best = '';
    let bestN = 0;
    for (const [name, n] of counts) {
        if (n > bestN) { best = name; bestN = n; }
    }
    return best;
}

export interface ManagerSetupForm {
    targetTons: string;
    pieceRate: string;
    /** blockId → variedad escrita */
    varieties: Record<string, string>;
}

export type SetupError = 'target' | 'rate' | null;

/** Comprueba lo escrito: meta y precio números positivos */
export function validateSetup(form: ManagerSetupForm): SetupError {
    const target = Number(form.targetTons);
    if (!form.targetTons.trim() || !Number.isFinite(target) || target <= 0) return 'target';
    const rate = Number(form.pieceRate);
    if (!form.pieceRate.trim() || !Number.isFinite(rate) || rate <= 0 || rate > 100) return 'rate';
    return null;
}

/** Bloques cuya variedad cambió respecto a la que tenían (solo esos se guardan) */
export function changedVarieties(
    form: Record<string, string>,
    original: Record<string, string>
): Array<{ blockId: string; variety: string }> {
    return Object.entries(form)
        .map(([blockId, v]) => ({ blockId, variety: v.trim() }))
        .filter(({ blockId, variety }) => variety !== '' && variety !== (original[blockId] ?? ''));
}
