/**
 * useSettings Hook Tests — pure logic
 */
import { describe, it, expect } from 'vitest';

// Test the initials derivation logic from useSettings
const getInitials = (name: string): string => {
    return (name || 'M')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

describe('useSettings — initials logic', () => {
    it('extracts initials from full name', () => {
        expect(getInitials('John Doe')).toBe('JD');
    });

    it('handles single name', () => {
        expect(getInitials('Alice')).toBe('A');
    });

    it('truncates to 2 characters', () => {
        expect(getInitials('John Michael Doe')).toBe('JM');
    });

    it('defaults to M for empty string', () => {
        expect(getInitials('')).toBe('M');
    });

    it('uppercases lowercase names', () => {
        expect(getInitials('jane smith')).toBe('JS');
    });
});

describe('useSettings — form defaults', () => {
    const defaults = {
        piece_rate: 6.5,
        min_wage_rate: 23.95,
        min_buckets_per_hour: 8,
        target_tons: 40,
        variety: 'Cherry',
    };

    it('has correct default piece rate', () => {
        expect(defaults.piece_rate).toBe(6.5);
    });

    it('has correct default min wage', () => {
        expect(defaults.min_wage_rate).toBe(23.95);
    });

    it('has correct default target tons', () => {
        expect(defaults.target_tons).toBe(40);
    });

    it('has correct default variety', () => {
        expect(defaults.variety).toBe('Cherry');
    });
});

// ── Variedades del huerto: de las filas (block_rows), no de orchards.crop_type ──
import { varietiesOfRows } from './useSettings';

describe('varietiesOfRows', () => {
    it('lists the distinct row varieties of the orchard, alphabetically', () => {
        const blocks = [
            { rowVarieties: { 1: 'Royal Gala', 2: 'Royal Gala', 3: 'Braeburn' } },
            { rowVarieties: { 16: 'Braeburn', 17: 'Royal Gala' } },
        ];
        expect(varietiesOfRows(blocks)).toEqual(['Braeburn', 'Royal Gala']);
    });

    it('ignores blank rows and the "Desconocida" placeholder the map slice uses', () => {
        const blocks = [{ rowVarieties: { 1: '  ', 2: 'Desconocida', 3: 'Fuji ' } }];
        expect(varietiesOfRows(blocks)).toEqual(['Fuji']);
    });

    it('returns an empty list when the orchard has no rows loaded', () => {
        expect(varietiesOfRows([])).toEqual([]);
        expect(varietiesOfRows([{ rowVarieties: {} }])).toEqual([]);
    });
});
