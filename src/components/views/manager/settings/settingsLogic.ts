/**
 * Lógica pura de la pantalla de ajustes.
 * @module components/views/manager/settings/settingsLogic
 */

/**
 * Objetivo cubetas/hora: nunca por debajo del mínimo de compliance.
 * Un valor vacío o no numérico vuelve al mínimo.
 */
export function clampToFloor(raw: string, floor: number): number {
    const parsed = parseFloat(raw) || floor;
    return Math.max(parsed, floor);
}

/** Rellena la plantilla traducida del aviso de mínimo (${wage}, ${rate}, {floor}) */
export function fillMinWarning(template: string, minWage: number, pieceRate: number, floor: number): string {
    return template
        .replace('${wage}', String(minWage))
        .replace('${rate}', String(pieceRate))
        .replace('{floor}', String(floor));
}
