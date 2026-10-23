/**
 * wizard.types — pasos, datos iniciales y validación de temporada/bloques
 */
import { describe, it, expect } from 'vitest';
import { STEPS, VARIETIES, initialWizardData, newBlock, blockLetter, validateStructure } from './wizard.types';
import { sampleWizardData } from './testData';

describe('STEPS', () => {
    it('orchard → structure → rates → summary, labels are i18n keys', () => {
        expect(STEPS.map(s => s.key)).toEqual(['orchard', 'structure', 'rates', 'summary']);
        for (const s of STEPS) expect(s.label.startsWith('owiz.step.')).toBe(true);
    });
});

describe('initialWizardData', () => {
    it('starts with an active-season name, today and one block of rows 1–10', () => {
        const d = initialWizardData('2026-10-24', 'Season 2026–27', 'Block A');
        expect(d.season).toEqual({ name: 'Season 2026–27', start_date: '2026-10-24', end_date: '' });
        expect(d.blocks).toEqual([newBlock('Block A', 1)]);
        expect(d.blocks[0]).toMatchObject({ row_from: 1, row_to: 10, target_buckets: 100 });
        expect(VARIETIES).toContain(d.rates.variety);
    });

    it('block letters go A, B, C…', () => {
        expect([0, 1, 2, 25].map(blockLetter)).toEqual(['A', 'B', 'C', 'Z']);
    });
});

describe('validateStructure', () => {
    it('accepts the sample', () => {
        expect(validateStructure(sampleWizardData)).toBeNull();
    });

    it.each([
        ['season without name', { season: { ...sampleWizardData.season, name: ' ' } }, 'owiz.err.season'],
        ['end before start', { season: { ...sampleWizardData.season, end_date: '2026-01-01' } }, 'owiz.err.dates'],
        ['no blocks', { blocks: [] }, 'owiz.err.no_blocks'],
        ['block without name', { blocks: [{ ...sampleWizardData.blocks[0], name: '' }] }, 'owiz.err.block_name'],
        ['same name twice', { blocks: [sampleWizardData.blocks[0], { ...sampleWizardData.blocks[1], name: 'block a' }] }, 'owiz.err.block_dup'],
        ['to before from', { blocks: [{ ...sampleWizardData.blocks[0], row_from: 9, row_to: 3 }] }, 'owiz.err.range'],
        ['empty number', { blocks: [{ ...sampleWizardData.blocks[0], row_to: Number.NaN }] }, 'owiz.err.range'],
        ['more than 1000 rows', { blocks: [{ ...sampleWizardData.blocks[0], row_from: 1, row_to: 1001 }] }, 'owiz.err.range'],
        ['bad target', { blocks: [{ ...sampleWizardData.blocks[0], target_buckets: -1 }] }, 'owiz.err.target'],
        ['overlap', { blocks: [sampleWizardData.blocks[0], { ...sampleWizardData.blocks[1], row_from: 15 }] }, 'owiz.err.overlap'],
    ])('rejects %s', (_label, patch, key) => {
        expect(validateStructure({ ...sampleWizardData, ...patch })).toBe(key);
    });
});
