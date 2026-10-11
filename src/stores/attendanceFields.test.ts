import { describe, it, expect } from 'vitest';
import { attendanceFields } from './storeSync';

describe('attendanceFields — tramos de hoy', () => {
    it('sin tramos: no presente', () => {
        expect(attendanceFields([])).toMatchObject({ checked_in_today: false, check_in: undefined });
    });

    it('salió y volvió: el tramo actual es el abierto', () => {
        const f = attendanceFields([
            { id: 'b', check_in: '2026-10-12T13:00:00+13:00', check_out: null },
            { id: 'a', check_in: '2026-10-12T07:00:00+13:00', check_out: '2026-10-12T11:00:00+13:00' },
        ]);
        expect(f.checked_in_today).toBe(true);
        expect(f.check_in).toBe('2026-10-12T13:00:00+13:00');
        expect(f.check_out).toBeUndefined();
        expect(f.shifts?.map(s => s.id)).toEqual(['a', 'b']);
    });

    it('todos cerrados: el último', () => {
        const f = attendanceFields([
            { id: 'a', check_in: '2026-10-12T07:00:00+13:00', check_out: '2026-10-12T11:00:00+13:00' },
            { id: 'b', check_in: '2026-10-12T12:00:00+13:00', check_out: '2026-10-12T15:00:00+13:00' },
        ]);
        expect(f.check_out).toBe('2026-10-12T15:00:00+13:00');
    });
});
