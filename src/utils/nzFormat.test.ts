import { describe, it, expect } from 'vitest';
import { formatNZTime, formatNZDate, formatNZDateTime, formatNZD, formatNZNumber } from './nzFormat';

// 2026-10-13T18:30Z = 14 Oct 07:30 NZDT (+13): otro día y otra hora que en UTC
const EVENING_UTC = '2026-10-13T18:30:00Z';

describe('nzFormat', () => {
    it('shows times in NZ time, 24 h, whatever the device time zone', () => {
        expect(formatNZTime(EVENING_UTC)).toBe('07:30');
        expect(formatNZTime('2026-06-01T00:05:00Z')).toBe('12:05'); // NZST (+12) en invierno
        expect(formatNZTime(null)).toBe('');
        expect(formatNZTime('not a date')).toBe('');
    });

    it('shows dates as NZ calendar days (day before month)', () => {
        expect(formatNZDate(EVENING_UTC)).toBe('14/10/2026');
        expect(formatNZDate(EVENING_UTC, 'medium')).toBe('14 Oct 2026');
        expect(formatNZDate(EVENING_UTC, 'weekdayShort')).toBe('Wed, 14 Oct');
        expect(formatNZDateTime(EVENING_UTC)).toBe('14/10/2026, 07:30');
    });

    it('does not shift a plain YYYY-MM-DD day', () => {
        expect(formatNZDate('2026-03-01')).toBe('01/03/2026');
        expect(formatNZDate('2026-03-01', 'weekday')).toBe('Sunday, 1 March');
    });

    it('formats money as NZD and numbers with NZ separators', () => {
        expect(formatNZD(1234.5)).toBe('$1,234.50');
        expect(formatNZD(23.5, 0)).toBe('$24');
        expect(formatNZD(-5)).toBe('-$5.00');
        expect(formatNZNumber(12345.678, 1)).toBe('12,345.7');
        expect(formatNZD(Number.NaN)).toBe('');
    });
});
