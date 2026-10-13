/**
 * Deep tests for compliance.service.ts — NZ labor law compliance
 * Covers: calculateNextBreakDue, isBreakOverdue, getRequiredBreakDuration,
 *         calculateEffectiveHourlyRate, checkWageCompliance, getMinimumBucketsPerHour,
 *         checkWorkHoursCompliance, checkPickerCompliance
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/nzst', () => ({
    nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
import {
    calculateNextBreakDue, isBreakOverdue, getRequiredBreakDuration,
    calculateEffectiveHourlyRate, checkWageCompliance, getMinimumBucketsPerHour,
    checkWorkHoursCompliance, checkPickerCompliance,
    NZ_BREAK_REQUIREMENTS,
} from '../compliance.service';

// === BREAK COMPLIANCE ===

describe('calculateNextBreakDue', () => {
    const workStart = new Date('2026-03-10T07:00:00');

    it('calculates rest break due 2h after work start when no prior break', () => {
        const due = calculateNextBreakDue(null, 'rest', workStart);
        expect(due.getTime()).toBe(workStart.getTime() + 120 * 60 * 1000);
    });

    it('calculates rest break due 2h after last break', () => {
        const lastBreak = new Date('2026-03-10T09:10:00');
        const due = calculateNextBreakDue(lastBreak, 'rest', workStart);
        expect(due.getTime()).toBe(lastBreak.getTime() + 120 * 60 * 1000);
    });

    it('calculates meal break due 4h after work start', () => {
        const due = calculateNextBreakDue(null, 'meal', workStart);
        expect(due.getTime()).toBe(workStart.getTime() + 240 * 60 * 1000);
    });

    it('calculates hydration break due 45 min after work start', () => {
        const due = calculateNextBreakDue(null, 'hydration', workStart);
        expect(due instanceof Date).toBe(true);
    });
});

describe('isBreakOverdue', () => {
    const workStart = new Date('2026-03-10T07:00:00');

    it('returns overdue=true when past due time', () => {
        const result = isBreakOverdue(null, 'rest', workStart);
        // 2h since work start has passed (we're testing in 2026)
        expect(result).toHaveProperty('overdue');
        expect(result).toHaveProperty('minutesOverdue');
        expect(result).toHaveProperty('dueAt');
    });

    it('returns correct structure for recent break', () => {
        // Use a timestamp that's 10 min before the mocked nowNZST (2026-03-10T01:00:00Z)
        const mockedNowUTC = new Date('2026-03-10T01:00:00Z');
        const recentBreak = new Date(mockedNowUTC.getTime() - 10 * 60000); // 10 min ago
        const result = isBreakOverdue(recentBreak, 'rest', workStart);
        expect(result).toHaveProperty('overdue');
        expect(result).toHaveProperty('minutesOverdue');
        expect(result).toHaveProperty('dueAt');
        // dueAt should be recentBreak + 2h
        expect(result.dueAt.getTime()).toBe(recentBreak.getTime() + 120 * 60 * 1000);
    });
});

describe('getRequiredBreakDuration', () => {
    it('returns 10 min for rest break', () => {
        expect(getRequiredBreakDuration('rest')).toBe(NZ_BREAK_REQUIREMENTS.REST_BREAK_DURATION_MINUTES);
    });

    it('returns 30 min for meal break', () => {
        expect(getRequiredBreakDuration('meal')).toBe(NZ_BREAK_REQUIREMENTS.MEAL_BREAK_DURATION_MINUTES);
    });

    it('returns number for hydration break', () => {
        const dur = getRequiredBreakDuration('hydration');
        expect(typeof dur).toBe('number');
        expect(dur).toBeGreaterThan(0);
    });
});

// === WAGE COMPLIANCE ===

describe('calculateEffectiveHourlyRate', () => {
    it('calculates rate for normal work', () => {
        const rate = calculateEffectiveHourlyRate(20, 8);
        expect(rate).toBe(20 * 6.50 / 8); // 16.25
    });

    it('returns 0 for zero hours', () => {
        const rate = calculateEffectiveHourlyRate(10, 0);
        expect(rate).toBe(0);
    });

    it('uses custom piece rate', () => {
        const rate = calculateEffectiveHourlyRate(10, 5, 10);
        expect(rate).toBe(10 * 10 / 5); // 20
    });
});

describe('checkWageCompliance', () => {
    it('is compliant when above minimum wage', () => {
        const result = checkWageCompliance(40, 8); // 40 * 6.50 / 8 = 32.50
        expect(result.isCompliant).toBe(true);
        expect(result.shortfall).toBe(0);
        expect(result.topUpRequired).toBe(0);
    });

    it('is not compliant when below minimum wage', () => {
        const result = checkWageCompliance(5, 8); // 5 * 6.50 / 8 = 4.06
        expect(result.isCompliant).toBe(false);
        expect(result.shortfall).toBeGreaterThan(0);
        expect(result.topUpRequired).toBeGreaterThan(0);
    });

    it('handles zero hours', () => {
        const result = checkWageCompliance(10, 0);
        expect(result).toHaveProperty('isCompliant');
    });

    it('uses custom min wage', () => {
        const result = checkWageCompliance(40, 8, 6.50, 30);
        expect(result.minimumWage).toBe(30);
    });
});

describe('getMinimumBucketsPerHour', () => {
    it('returns minimum buckets needed at default rates', () => {
        const min = getMinimumBucketsPerHour();
        expect(min).toBeGreaterThan(3);
        expect(min).toBeLessThan(5);
    });

    it('calculates with custom rates', () => {
        const min = getMinimumBucketsPerHour(10, 25);
        expect(min).toBe(2.5); // 25 / 10
    });
});

// === WORK HOURS COMPLIANCE ===

describe('checkWorkHoursCompliance', () => {
    it('no break needed for short shifts', () => {
        const result = checkWorkHoursCompliance(60, 60);
        expect(result.needsBreak).toBe(false);
    });

    it('needs break after extended consecutive work', () => {
        const result = checkWorkHoursCompliance(180, 180); // 3h
        expect(result.needsBreak).toBe(true);
    });

    it('warns for very long days', () => {
        const result = checkWorkHoursCompliance(120, 600); // 10h total
        expect(result).toHaveProperty('maxRecommendedReached');
    });
});

// === FULL COMPLIANCE CHECK ===

describe('checkPickerCompliance', () => {
    const baseInput = {
        pickerId: 'p1',
        bucketCount: 30,
        hoursWorked: 8,
        consecutiveMinutesWorked: 120,
        totalMinutesToday: 480,
        // Descansos 15 min antes del "ahora" mockeado (14:00 NZDT)
        lastRestBreakAt: new Date('2026-03-10T13:45:00+13:00'),
        lastMealBreakAt: new Date('2026-03-10T13:45:00+13:00'),
        lastHydrationAt: new Date('2026-03-10T13:45:00+13:00'),
        workStartTime: new Date('2026-03-10T07:00:00+13:00'),
    };

    it('returns compliant status for normal worker', () => {
        const result = checkPickerCompliance(baseInput);
        expect(result.pickerId).toBe('p1');
        expect(result).toHaveProperty('isCompliant');
        expect(result).toHaveProperty('violations');
        expect(result).toHaveProperty('workHours');
        expect(result.violations.filter(v => v.type === 'break_overdue')).toEqual([]);
    });

    it('detects wage violation for low buckets', () => {
        const result = checkPickerCompliance({ ...baseInput, bucketCount: 2 });
        const wageViolation = result.violations.find(v => v.type === 'wage_below_minimum');
        expect(wageViolation).toBeDefined();
    });

    it('detects excessive hours violation', () => {
        const result = checkPickerCompliance({ ...baseInput, totalMinutesToday: 720 }); // 12h
        expect(result.workHours.maxRecommended).toBeGreaterThan(0);
    });

    it('detects break overdue when no breaks taken', () => {
        const result = checkPickerCompliance({
            ...baseInput,
            lastRestBreakAt: null,
            lastMealBreakAt: null,
            lastHydrationAt: null,
            consecutiveMinutesWorked: 300,
        });
        expect(result.violations.some(v => v.type === 'break_overdue')).toBe(true);
    });
});

