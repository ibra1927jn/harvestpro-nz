import { describe, it, expect } from 'vitest';
import { countPresence, presenceOf } from './presence';

const now = new Date('2026-10-23T01:00:00Z'); // 14:00 NZDT

describe('presenceOf', () => {
    it('open shift: clocked in, or on break inside the recorded break', () => {
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z' }, false, now)).toBe('on_shift');
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z', break_start: '2026-10-23T00:45:00Z' }, false, now)).toBe('on_break');
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z', break_start: '2026-10-23T00:00:00Z' }, false, now)).toBe('on_shift');
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z', break_start: '2026-10-23T00:00:00Z', break_minutes: 90 }, false, now)).toBe('on_break');
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z', status: 'on_break' }, false, now)).toBe('on_break');
    });

    it('working wins over leave (half day); otherwise leave, left or not in', () => {
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z' }, true, now)).toBe('on_shift');
        expect(presenceOf({}, true, now)).toBe('on_leave');
        expect(presenceOf({ check_in: '2026-10-22T20:00:00Z', check_out: '2026-10-22T23:00:00Z' }, false, now)).toBe('left');
        expect(presenceOf({ checked_in_today: true }, false, now)).toBe('left');
        expect(presenceOf({}, false, now)).toBe('not_in');
    });

    it('counts per state', () => {
        expect(countPresence(['on_shift', 'on_shift', 'on_leave'])).toEqual({ on_shift: 2, on_break: 0, left: 0, on_leave: 1, not_in: 0 });
    });
});
