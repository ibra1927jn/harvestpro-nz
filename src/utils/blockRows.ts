/**
 * Números de fila reales de un bloque del mapa.
 *
 * Un bloque puede tener huecos (dos rangos, o una fila archivada en medio):
 * start_row + total_rows ya no describe sus filas. Las filas son las claves de
 * rowVarieties (una por cada fila activa de block_rows). Solo si el bloque no
 * trae filas cargadas (datos antiguos) se usa el rango start..start+total-1.
 */
import type { OrchardBlock } from '@/types';

export function blockRowNumbers(block: Pick<OrchardBlock, 'startRow' | 'totalRows' | 'rowVarieties'>): number[] {
    const fromRows = Object.keys(block.rowVarieties ?? {})
        .map(Number)
        .filter(n => Number.isInteger(n) && n > 0)
        .sort((a, b) => a - b);
    if (fromRows.length > 0) return fromRows;
    return Array.from({ length: Math.max(0, block.totalRows) }, (_, i) => block.startRow + i);
}
