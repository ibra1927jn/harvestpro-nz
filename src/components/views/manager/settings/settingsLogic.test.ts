import { describe, it, expect } from 'vitest';
import { clampToFloor, fillMinWarning } from './settingsLogic';

describe('settingsLogic', () => {
    it('clampToFloor no deja bajar del mínimo de compliance', () => {
        expect(clampToFloor('2', 4)).toBe(4);
        expect(clampToFloor('7.5', 4)).toBe(7.5);
        expect(clampToFloor('', 4)).toBe(4);
        expect(clampToFloor('abc', 4)).toBe(4);
    });

    it('clampToFloor trata 0 como vacío (vuelve al mínimo)', () => {
        expect(clampToFloor('0', 4)).toBe(4);
    });

    it('fillMinWarning sustituye los tres marcadores', () => {
        expect(fillMinWarning('Min ${wage}/h ÷ ${rate} = {floor}', 23.95, 6.5, 4)).toBe('Min 23.95/h ÷ 6.5 = 4');
    });
});
