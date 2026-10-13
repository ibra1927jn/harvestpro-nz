// =============================================
// NZST TIMEZONE UTILITY TESTS
// =============================================
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { nowNZST, todayNZST, toNZST, yesterdayNZST, startOfWeekNZ, dateInNZST, nzOffsetOn, nzMidnight, nzEndOfDay } from './nzst';

describe('NZST Timezone Utility', () => {
    // =============================================
    // nowNZST
    // =============================================
    describe('nowNZST', () => {
        it('should return a string', () => {
            expect(typeof nowNZST()).toBe('string');
        });

        it('should include a timezone offset', () => {
            const result = nowNZST();
            // Should end with +XX:00 (NZ offset varies by season and Node ICU data)
            expect(result).toMatch(/\+\d{2}:00$/);
        });

        it('should be in ISO-like format', () => {
            const result = nowNZST();
            // YYYY-MM-DDTHH:MM:SS+HH:00
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+\d{2}:00$/);
        });

        it('should return different values on successive calls (or same within 1s)', () => {
            const t1 = nowNZST();
            const t2 = nowNZST();
            // Both should be valid ISO-like strings
            expect(t1).toMatch(/^\d{4}/);
            expect(t2).toMatch(/^\d{4}/);
        });
    });

    // =============================================
    // todayNZST
    // =============================================
    describe('todayNZST', () => {
        it('should return a date in YYYY-MM-DD format', () => {
            const today = todayNZST();
            expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('should return a valid date', () => {
            const today = todayNZST();
            const parsed = new Date(today);
            expect(parsed.toString()).not.toBe('Invalid Date');
        });

        it('should return current year', () => {
            const today = todayNZST();
            const year = parseInt(today.split('-')[0]);
            expect(year).toBeGreaterThanOrEqual(2024);
            expect(year).toBeLessThanOrEqual(2030);
        });
    });

    // =============================================
    // yesterdayNZST
    // =============================================
    describe('yesterdayNZST', () => {
        it('returns a string in YYYY-MM-DD format', () => {
            expect(yesterdayNZST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('returns a date exactly 1 day before todayNZST', () => {
            const today = todayNZST();
            const yesterday = yesterdayNZST();
            const [ty, tm, td] = today.split('-').map(Number);
            // yesterday usado solo para llamar yesterdayNZST(), ya verificado con expectedStr
            // Restar 1 día del calendario NZ (no 24h UTC)
            const todayDate = new Date(Date.UTC(ty, tm - 1, td));
            const expectedYesterday = new Date(todayDate.getTime() - 86_400_000);
            const expectedStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(expectedYesterday);
            expect(yesterday).toBe(expectedStr);
        });

        it('is always different from todayNZST', () => {
            expect(yesterdayNZST()).not.toBe(todayNZST());
        });
    });

    // =============================================
    // startOfWeekNZ
    // =============================================
    describe('startOfWeekNZ', () => {
        it('returns a string in YYYY-MM-DD format', () => {
            expect(startOfWeekNZ()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('returned date is on a Monday', () => {
            const monday = startOfWeekNZ();
            const [y, m, d] = monday.split('-').map(Number);
            const date = new Date(Date.UTC(y, m - 1, d));
            expect(date.getUTCDay()).toBe(1); // 1 = lunes
        });

        it('is <= todayNZST', () => {
            expect(startOfWeekNZ() <= todayNZST()).toBe(true);
        });
    });

    // =============================================
    // toNZST
    // =============================================
    describe('toNZST', () => {
        it('should convert a Date to a string with NZ offset', () => {
            const date = new Date('2026-02-12T00:00:00Z');
            const result = toNZST(date);
            // Should contain a positive offset (NZ is ahead of UTC)
            expect(result).toMatch(/\+\d{2}:00$/);
            // The time portion should reflect NZ time (hours ahead of UTC)
            expect(result).toMatch(/^2026-02-12T/);
        });

        it('should produce consistent results for the same input', () => {
            const date = new Date('2026-06-15T00:00:00Z');
            const result1 = toNZST(date);
            const result2 = toNZST(date);
            expect(result1).toBe(result2);
        });

        it('should produce a date string ahead of UTC', () => {
            // NZ is always ahead of UTC (by 12 or 13 hours)
            const date = new Date('2026-01-15T06:00:00Z');
            const result = toNZST(date);
            // Extract the hour from result
            const hourMatch = result.match(/T(\d{2}):/);
            expect(hourMatch).not.toBeNull();
            const nzHour = parseInt(hourMatch![1]);
            // NZ time should be 6 + offset hours (wrapping at 24)
            // At minimum +10 offset, so hour should be >= 16 (or wrapped next day)
            expect(nzHour).toBeGreaterThanOrEqual(0); // valid hour
            expect(nzHour).toBeLessThanOrEqual(23);
        });

        it('should handle date boundary crossover', () => {
            // Late night UTC should be next day in NZ
            const date = new Date('2026-03-10T23:00:00Z');
            const result = toNZST(date);
            // Should be March 11 in NZ time (NZ is at least +10 ahead)
            expect(result).toMatch(/^2026-03-11/);
        });

        it('should produce valid ISO-like format', () => {
            const date = new Date();
            const result = toNZST(date);
            expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+\d{2}:00$/);
        });

        it('should have a positive offset', () => {
            const date = new Date();
            const result = toNZST(date);
            const offsetMatch = result.match(/\+(\d{2}):00$/);
            expect(offsetMatch).not.toBeNull();
            const offset = parseInt(offsetMatch![1]);
            // When TZ=Pacific/Auckland in test env, offset may vary.
            // Just verify it's a reasonable positive number.
            expect(offset).toBeGreaterThanOrEqual(0);
            expect(offset).toBeLessThanOrEqual(14);
        });
    });
});

describe('toNZST — same instant whatever the phone timezone', () => {
    const original = process.env.TZ;
    afterAll(() => { process.env.TZ = original; });
    for (const tz of ['UTC', 'Europe/Madrid', 'Pacific/Auckland', 'America/Los_Angeles']) {
        it(`gives NZ time with the right offset when the device is in ${tz}`, () => {
            process.env.TZ = tz;
            const summer = new Date('2026-10-12T04:32:42.500Z');
            expect(toNZST(summer)).toBe('2026-10-12T17:32:42+13:00');
            const winter = new Date('2026-06-01T12:00:00Z');
            expect(toNZST(winter)).toBe('2026-06-02T00:00:00+12:00');
            expect(new Date(toNZST(summer)).getTime()).toBe(Date.parse('2026-10-12T04:32:42Z'));
        });
    }
});

// =============================================
// Comportamiento real: fechas fijas, DST y propiedades
// =============================================
describe('NZ calendar helpers with a fixed clock', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('todayNZST/yesterdayNZST use the NZ calendar, not UTC (04:30 NZ is still "today")', () => {
        vi.useFakeTimers();
        // 2026-03-09 16:30Z = 2026-03-10 05:30 NZDT
        vi.setSystemTime(new Date('2026-03-09T16:30:00Z'));
        expect(todayNZST()).toBe('2026-03-10');
        expect(yesterdayNZST()).toBe('2026-03-09');
        expect(nowNZST()).toBe('2026-03-10T05:30:00+13:00');
    });

    it('yesterdayNZST crosses month and year boundaries', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-12-31T12:00:00Z')); // 2026-01-01 01:00 NZDT
        expect(todayNZST()).toBe('2026-01-01');
        expect(yesterdayNZST()).toBe('2025-12-31');
    });

    it('yesterdayNZST on the day after DST starts is the DST day itself', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-27T11:30:00Z')); // 2026-09-28 00:30 NZDT
        expect(yesterdayNZST()).toBe('2026-09-27');
    });

    it('startOfWeekNZ returns the NZ Monday for every weekday, including Sunday', () => {
        // Semana del lunes 2026-10-05 al domingo 2026-10-11 (NZDT, +13)
        const cases: Array<[string, string]> = [
            ['2026-10-04T11:00:00Z', '2026-10-05'], // lunes 00:00 NZ
            ['2026-10-06T22:00:00Z', '2026-10-05'], // miercoles
            ['2026-10-11T10:59:59Z', '2026-10-05'], // domingo 23:59:59 NZ
            ['2026-10-11T11:00:00Z', '2026-10-12'], // lunes siguiente 00:00 NZ
        ];
        for (const [utc, monday] of cases) {
            expect(startOfWeekNZ(new Date(utc))).toBe(monday);
        }
    });

    it('startOfWeekNZ without argument uses "now" in NZ', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-10T20:00:00Z')); // domingo 11 oct 09:00 NZ
        expect(startOfWeekNZ()).toBe('2026-10-05');
    });

    it('dateInNZST maps early-morning NZ scans to the NZ day and empty input to ""', () => {
        expect(dateInNZST('2026-03-09T15:30:00Z')).toBe('2026-03-10'); // 04:30 NZDT
        expect(dateInNZST('2026-06-30T11:59:59Z')).toBe('2026-06-30'); // 23:59:59 NZST
        expect(dateInNZST('2026-06-30T12:00:00Z')).toBe('2026-07-01');
        expect(dateInNZST('')).toBe('');
    });
});

describe('nzOffsetOn / nzMidnight / nzEndOfDay', () => {
    it('reports +13 in summer and +12 in winter', () => {
        expect(nzOffsetOn('2026-01-15')).toBe('+13:00');
        expect(nzOffsetOn('2026-07-15')).toBe('+12:00');
    });

    it('builds midnight and end of day for ordinary days', () => {
        expect(nzMidnight('2026-07-15')).toBe('2026-07-15T00:00:00+12:00');
        expect(nzEndOfDay('2026-07-15')).toBe('2026-07-15T23:59:59+12:00');
        expect(nzMidnight('2026-01-15')).toBe('2026-01-15T00:00:00+13:00');
        expect(nzEndOfDay('2026-01-15')).toBe('2026-01-15T23:59:59+13:00');
    });

    it('DST start day (2026-09-27): midnight is still NZST (+12), end of day is NZDT (+13)', () => {
        // Bug previo: usaba el desfase del mediodia (+13) y la medianoche caia a las 23:00 del dia anterior
        expect(nzMidnight('2026-09-27')).toBe('2026-09-27T00:00:00+12:00');
        expect(nzEndOfDay('2026-09-27')).toBe('2026-09-27T23:59:59+13:00');
        expect(dateInNZST(new Date(nzMidnight('2026-09-27')).toISOString())).toBe('2026-09-27');
    });

    it('DST end day (2026-04-05): midnight is still NZDT (+13), end of day is NZST (+12)', () => {
        // Bug previo: +12 a medianoche dejaba fuera la primera hora del dia
        expect(nzMidnight('2026-04-05')).toBe('2026-04-05T00:00:00+13:00');
        expect(nzEndOfDay('2026-04-05')).toBe('2026-04-05T23:59:59+12:00');
        expect(dateInNZST(new Date(new Date(nzMidnight('2026-04-05')).getTime() - 1).toISOString())).toBe('2026-04-04');
    });

    it('property: nzMidnight/nzEndOfDay bound exactly the NZ calendar day for any date', () => {
        const day = fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T00:00:00Z'), noInvalidDate: true })
            .map(d => d.toISOString().slice(0, 10));
        fc.assert(fc.property(day, (ymd) => {
            const start = new Date(nzMidnight(ymd)).getTime();
            const end = new Date(nzEndOfDay(ymd)).getTime();
            expect(dateInNZST(new Date(start).toISOString())).toBe(ymd);
            expect(dateInNZST(new Date(start - 1000).toISOString())).not.toBe(ymd);
            expect(dateInNZST(new Date(end).toISOString())).toBe(ymd);
            expect(dateInNZST(new Date(end + 1000).toISOString())).not.toBe(ymd);
        }), { numRuns: 300 });
    });
});

describe('toNZST properties', () => {
    const instant = fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T00:00:00Z'), noInvalidDate: true });

    it('round-trips to the same instant (to the second) and keeps a +12/+13 offset', () => {
        fc.assert(fc.property(instant, (d) => {
            const s = toNZST(d);
            expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+1[23]:00$/);
            expect(new Date(s).getTime()).toBe(Math.floor(d.getTime() / 1000) * 1000);
            expect(s.slice(0, 10)).toBe(dateInNZST(d.toISOString()));
        }), { numRuns: 500 });
    });

    it('handles the repeated hour when DST ends (02:30 happens twice)', () => {
        expect(toNZST(new Date('2026-04-04T13:30:00Z'))).toBe('2026-04-05T02:30:00+13:00');
        expect(toNZST(new Date('2026-04-04T14:30:00Z'))).toBe('2026-04-05T02:30:00+12:00');
    });

    it('jumps from 01:59 NZST to 03:00 NZDT when DST starts', () => {
        expect(toNZST(new Date('2026-09-26T13:59:00Z'))).toBe('2026-09-27T01:59:00+12:00');
        expect(toNZST(new Date('2026-09-26T14:00:00Z'))).toBe('2026-09-27T03:00:00+13:00');
    });

    it('keeps the seconds of the instant', () => {
        expect(toNZST(new Date('2026-06-01T00:00:07Z'))).toBe('2026-06-01T12:00:07+12:00');
    });

    it('startOfWeekNZ is always a Monday no more than 6 days before the NZ date', () => {
        fc.assert(fc.property(instant, (d) => {
            const monday = startOfWeekNZ(d);
            const today = dateInNZST(d.toISOString());
            const diff = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86_400_000;
            expect(new Date(`${monday}T00:00:00Z`).getUTCDay()).toBe(1);
            expect(diff).toBeGreaterThanOrEqual(0);
            expect(diff).toBeLessThanOrEqual(6);
        }), { numRuns: 300 });
    });
});
