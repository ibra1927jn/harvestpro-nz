/**
 * qcCriteria — nota y puntuación a partir de los seis criterios (tabla de casos)
 */
import { describe, it, expect } from 'vitest';
import {
    QC_CRITERION_KEYS, countCriteria, countCriteriaFailures, gradeFromCriteria, isCriteriaComplete,
    markedCriteria, normalizeCriteria, scoreFromCriteria, worstCriterion, type QcCriteria,
} from './qcCriteria';

const allOk: QcCriteria = {
    ladder: 'ok', tree_damage: 'ok', fruit_on_ground: 'ok', bucket_fill: 'ok', size: 'ok', damaged_fruit: 'ok',
};

describe('gradeFromCriteria', () => {
    const cases: Array<[string, QcCriteria, ReturnType<typeof gradeFromCriteria>]> = [
        ['all ok → A', allOk, 'A'],
        ['nothing marked → A', {}, 'A'],
        ['one warn → B', { ...allOk, size: 'warn' }, 'B'],
        ['one warn, rest unmarked → B', { size: 'warn' }, 'B'],
        ['two warn → C', { ...allOk, size: 'warn', bucket_fill: 'warn' }, 'C'],
        ['three warn → C', { size: 'warn', bucket_fill: 'warn', damaged_fruit: 'warn' }, 'C'],
        ['one bad → C', { ...allOk, damaged_fruit: 'bad' }, 'C'],
        ['one bad + one warn → C', { ...allOk, damaged_fruit: 'bad', size: 'warn' }, 'C'],
        ['two bad → reject', { ...allOk, damaged_fruit: 'bad', bucket_fill: 'bad' }, 'reject'],
        ['two bad + warns → reject', { tree_damage: 'bad', fruit_on_ground: 'bad', size: 'warn' }, 'reject'],
        ['ladder bad alone → reject (safety)', { ...allOk, ladder: 'bad' }, 'reject'],
        ['ladder bad, nothing else marked → reject', { ladder: 'bad' }, 'reject'],
        ['ladder warn → B', { ...allOk, ladder: 'warn' }, 'B'],
    ];
    for (const [name, criteria, expected] of cases) {
        it(name, () => expect(gradeFromCriteria(criteria)).toBe(expected));
    }
});

describe('scoreFromCriteria', () => {
    const cases: Array<[string, QcCriteria, number]> = [
        ['all ok → 100', allOk, 100],
        ['nothing marked → 100', {}, 100],
        ['one warn of six → 92', { ...allOk, size: 'warn' }, 92],
        ['one bad of six → 83', { ...allOk, size: 'bad' }, 83],
        ['two warn of six → 83', { ...allOk, size: 'warn', bucket_fill: 'warn' }, 83],
        ['only marked ones count: one warn of two → 75', { size: 'warn', bucket_fill: 'ok' }, 75],
        ['one bad alone → 0', { damaged_fruit: 'bad' }, 0],
        ['all bad → 0', { ladder: 'bad', tree_damage: 'bad', fruit_on_ground: 'bad', bucket_fill: 'bad', size: 'bad', damaged_fruit: 'bad' }, 0],
        ['all warn → 50', { ladder: 'warn', tree_damage: 'warn', fruit_on_ground: 'warn', bucket_fill: 'warn', size: 'warn', damaged_fruit: 'warn' }, 50],
        ['ladder bad forces 0 even if the rest is ok', { ...allOk, ladder: 'bad' }, 0],
    ];
    for (const [name, criteria, expected] of cases) {
        it(name, () => expect(scoreFromCriteria(criteria)).toBe(expected));
    }

    it('always stays within 0-100 and is consistent with the grade ordering', () => {
        const states = ['ok', 'warn', 'bad'] as const;
        const byGrade: Record<string, number[]> = { A: [], B: [], C: [], reject: [] };
        // Dos criterios variables (ladder, size) con el resto en ok: 9 combinaciones
        for (const ladder of states) {
            for (const size of states) {
                const c: QcCriteria = { ...allOk, ladder, size };
                const s = scoreFromCriteria(c);
                expect(s).toBeGreaterThanOrEqual(0);
                expect(s).toBeLessThanOrEqual(100);
                byGrade[gradeFromCriteria(c)].push(s);
            }
        }
        expect(Math.min(...byGrade.A)).toBeGreaterThan(Math.max(...byGrade.B));
        expect(Math.min(...byGrade.B)).toBeGreaterThan(Math.max(...byGrade.C));
        expect(Math.min(...byGrade.C)).toBeGreaterThan(Math.max(...byGrade.reject));
    });
});

describe('helpers', () => {
    it('normalizeCriteria keeps only known keys with valid states', () => {
        expect(normalizeCriteria({ ladder: 'ok', size: 'bad', bogus: 'ok', bucket_fill: 'meh', tree_damage: 3 }))
            .toEqual({ ladder: 'ok', size: 'bad' });
        expect(normalizeCriteria(null)).toEqual({});
        expect(normalizeCriteria('ladder')).toEqual({});
        expect(normalizeCriteria(undefined)).toEqual({});
    });

    it('markedCriteria follows the canonical order and skips unmarked', () => {
        expect(markedCriteria({ size: 'warn', ladder: 'ok' })).toEqual([['ladder', 'ok'], ['size', 'warn']]);
    });

    it('countCriteria / isCriteriaComplete', () => {
        expect(countCriteria({ ladder: 'ok', size: 'warn', damaged_fruit: 'bad' })).toEqual({ marked: 3, warn: 1, bad: 1 });
        expect(isCriteriaComplete(allOk)).toBe(true);
        expect(isCriteriaComplete({ ...allOk, size: undefined })).toBe(false);
        expect(isCriteriaComplete({})).toBe(false);
        expect(QC_CRITERION_KEYS).toHaveLength(6);
    });
});

describe('countCriteriaFailures / worstCriterion', () => {
    const inspections = [
        { criteria: { ladder: 'ok', size: 'warn', damaged_fruit: 'bad' } },
        { criteria: { size: 'bad', bucket_fill: 'warn' } },
        { criteria: null },
        {},
        { criteria: 'garbage' },
        { criteria: { size: 'ok', damaged_fruit: 'warn' } },
    ];

    it('counts warn/bad per criterion over the day and sorts by total, then bad', () => {
        const out = countCriteriaFailures(inspections);
        expect(out).toHaveLength(6);
        expect(out[0]).toEqual({ key: 'size', warn: 1, bad: 1, total: 2 });
        expect(out[1]).toEqual({ key: 'damaged_fruit', warn: 1, bad: 1, total: 2 });
        expect(out[2]).toEqual({ key: 'bucket_fill', warn: 1, bad: 0, total: 1 });
        expect(out.slice(3).every(c => c.total === 0)).toBe(true);
    });

    it('bad outranks warn on equal totals', () => {
        const out = countCriteriaFailures([
            { criteria: { ladder: 'warn', size: 'bad' } },
        ]);
        expect(out[0].key).toBe('size');
        expect(out[1].key).toBe('ladder');
    });

    it('worstCriterion is null when nothing failed', () => {
        expect(worstCriterion([{ criteria: allOk }, { criteria: null }])).toBeNull();
        expect(worstCriterion([])).toBeNull();
        expect(worstCriterion(inspections)?.key).toBe('size');
    });
});
