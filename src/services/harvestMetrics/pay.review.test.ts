/**
 * Ninguna hora se paga sin revisar (Fase 2): unreviewedShifts decide qué tramos
 * impiden cerrar la semana de pago (close-pay-week usa la misma función).
 */
import { describe, it, expect } from 'vitest';
import { unreviewedShifts, type ReviewableShift } from './pay';

const nz = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+13:00`).toISOString();
const week = { start: '2026-10-12', end: '2026-10-18' };
const now = new Date('2026-10-20T00:00:00Z');

const shift = (over: Partial<ReviewableShift> = {}): ReviewableShift => ({
    picker_id: 'p1', date: '2026-10-14',
    check_in: nz('2026-10-14', '08:00'), check_out: nz('2026-10-14', '16:30'),
    verified_at: nz('2026-10-19', '09:00'), rejected_at: null, corrected_at: null,
    ...over,
});

describe('unreviewedShifts', () => {
    it('an approved shift can be paid', () => {
        expect(unreviewedShifts([shift()], week, now)).toEqual([]);
    });

    it('a shift nobody approved cannot', () => {
        expect(unreviewedShifts([shift({ verified_at: null })], week, now))
            .toEqual([{ pickerId: 'p1', date: '2026-10-14', issue: 'not_approved' }]);
    });

    it('a rejected shift cannot, until it is approved again', () => {
        expect(unreviewedShifts([shift({ verified_at: null, rejected_at: nz('2026-10-19', '09:00') })], week, now))
            .toEqual([{ pickerId: 'p1', date: '2026-10-14', issue: 'rejected' }]);
    });

    it('a shift over 14 h that nobody corrected cannot, even if it was marked approved', () => {
        const long = shift({ check_out: nz('2026-10-15', '00:30') }); // 16.5 h
        expect(unreviewedShifts([long], week, now)).toEqual([{ pickerId: 'p1', date: '2026-10-14', issue: 'needs_correction' }]);
        // Corregido a mano DESPUÉS de la salida y aprobado: se paga entero
        expect(unreviewedShifts([{ ...long, corrected_at: nz('2026-10-16', '09:00') }], week, now)).toEqual([]);
        // Corregido antes de la salida (la mañana, al cambiar la entrada): no cuenta
        expect(unreviewedShifts([{ ...long, corrected_at: nz('2026-10-14', '09:00') }], week, now))
            .toEqual([{ pickerId: 'p1', date: '2026-10-14', issue: 'needs_correction' }]);
    });

    it('an open shift (no check-out) cannot be approved: not approved, or needs correction once past 14 h', () => {
        const open = shift({ check_out: null, verified_at: null });
        expect(unreviewedShifts([open], week, new Date(nz('2026-10-14', '12:00')))[0].issue).toBe('not_approved');
        expect(unreviewedShifts([open], week, now)[0].issue).toBe('needs_correction');
    });

    it('only days of the range with a check-in count (absences have no hours)', () => {
        const rows = [
            shift({ date: '2026-10-11', verified_at: null }),
            shift({ date: '2026-10-19', verified_at: null }),
            shift({ check_in: null, check_out: null, verified_at: null }),
        ];
        expect(unreviewedShifts(rows, week, now)).toEqual([]);
    });

    it('lists every pending shift, by person and day', () => {
        const rows = [
            shift({ picker_id: 'p2', date: '2026-10-16', verified_at: null }),
            shift({ picker_id: 'p1', date: '2026-10-15', verified_at: null }),
            shift({ picker_id: 'p1', date: '2026-10-13', rejected_at: nz('2026-10-19', '09:00'), verified_at: null }),
            shift({ picker_id: 'p1', date: '2026-10-14' }),
        ];
        expect(unreviewedShifts(rows, week, now)).toEqual([
            { pickerId: 'p1', date: '2026-10-13', issue: 'rejected' },
            { pickerId: 'p1', date: '2026-10-15', issue: 'not_approved' },
            { pickerId: 'p2', date: '2026-10-16', issue: 'not_approved' },
        ]);
    });
});
