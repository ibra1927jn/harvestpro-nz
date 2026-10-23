import { describe, it, expect } from 'vitest';
import { changedVarieties, dominantVariety, validateSetup } from './managerSetupLogic';

describe('managerSetupLogic', () => {
    it('picks the most common known variety of a block', () => {
        expect(dominantVariety({ 1: 'Royal Gala', 2: 'Royal Gala', 3: 'Braeburn' })).toBe('Royal Gala');
        expect(dominantVariety({ 1: 'Unknown', 2: ' ' })).toBe('');
        expect(dominantVariety({})).toBe('');
    });

    it('requires a positive target and price', () => {
        expect(validateSetup({ targetTons: '40', pieceRate: '6.5', varieties: {} })).toBeNull();
        expect(validateSetup({ targetTons: '0', pieceRate: '6.5', varieties: {} })).toBe('target');
        expect(validateSetup({ targetTons: '', pieceRate: '6.5', varieties: {} })).toBe('target');
        expect(validateSetup({ targetTons: '40', pieceRate: '', varieties: {} })).toBe('rate');
        expect(validateSetup({ targetTons: '40', pieceRate: '-1', varieties: {} })).toBe('rate');
    });

    it('only saves the blocks whose variety changed (and never blanks one)', () => {
        expect(changedVarieties({ b1: 'Fuji', b2: 'Gala', b3: '' }, { b1: 'Fuji', b2: 'Braeburn', b3: 'Envy' }))
            .toEqual([{ blockId: 'b2', variety: 'Gala' }]);
    });
});
