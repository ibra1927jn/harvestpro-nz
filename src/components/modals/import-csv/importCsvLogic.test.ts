import { describe, it, expect } from 'vitest';
import { failedImport, isCsvFileName, splitVisible, stepSubtitle } from './importCsvLogic';

describe('importCsvLogic', () => {
    it('acepta .csv en cualquier caja y rechaza otras extensiones', () => {
        expect(isCsvFileName('pickers.csv')).toBe(true);
        expect(isCsvFileName('PICKERS.CSV')).toBe(true);
        expect(isCsvFileName('pickers.xlsx')).toBe(false);
        expect(isCsvFileName('csv.txt')).toBe(false);
    });

    it('subtítulo por paso', () => {
        expect(stepSubtitle('upload', 'x.csv')).toBe('Upload a CSV file');
        expect(stepSubtitle('preview', 'x.csv')).toBe('Preview: x.csv');
        expect(stepSubtitle('importing', '')).toBe('Importing...');
        expect(stepSubtitle('done', '')).toBe('Import Complete');
    });

    it('fallo total: 0 creados, todos saltados, mensaje del error', () => {
        expect(failedImport(7, new Error('RLS denied'))).toEqual({ created: 0, skipped: 7, errors: ['RLS denied'] });
        expect(failedImport(2, 'x').errors).toEqual(['Unknown error']);
    });

    it('splitVisible corta en el límite y cuenta el resto', () => {
        const items = Array.from({ length: 13 }, (_, i) => i);
        expect(splitVisible(items)).toEqual({ shown: items.slice(0, 10), hidden: 3 });
        expect(splitVisible([1, 2], 10)).toEqual({ shown: [1, 2], hidden: 0 });
    });
});
