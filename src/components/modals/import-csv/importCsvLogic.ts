/**
 * Lógica pura del asistente de importación CSV de pickers.
 * @module components/modals/import-csv/importCsvLogic
 */
export type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

export interface ImportResult {
    created: number;
    skipped: number;
    errors: string[];
}

/** Extensión .csv sin distinguir mayúsculas (Excel en Windows guarda a veces .CSV) */
export const isCsvFileName = (name: string): boolean => name.toLowerCase().endsWith('.csv');

/** Subtítulo de la cabecera según el paso */
export function stepSubtitle(step: ImportStep, fileName: string): string {
    switch (step) {
        case 'upload': return 'Upload a CSV file';
        case 'preview': return `Preview: ${fileName}`;
        case 'importing': return 'Importing...';
        case 'done': return 'Import Complete';
    }
}

/** Resultado cuando la importación entera falla: no se creó nada */
export function failedImport(validCount: number, err: unknown): ImportResult {
    return {
        created: 0,
        skipped: validCount,
        errors: [err instanceof Error ? err.message : 'Unknown error'],
    };
}

/** Solo se muestran los primeros `limit` errores; el resto se resume */
export function splitVisible<T>(items: readonly T[], limit = 10): { shown: readonly T[]; hidden: number } {
    return { shown: items.slice(0, limit), hidden: Math.max(0, items.length - limit) };
}
