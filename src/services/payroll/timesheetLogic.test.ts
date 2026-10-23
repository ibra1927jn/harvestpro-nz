import { describe, it, expect } from 'vitest';
import { PAY_RULES, type PaySegment } from '@/services/harvestMetrics/pay';
import type { TimesheetEntry } from './payroll.types';
import {
  assignBucketsToSegments,
  buildDailyRecord,
  buildTimesheetEntry,
  dayTopUpFor,
  groupSegmentsByPicker,
  splitDayHoursBySegment,
  type AttendanceForTimesheet,
  type DayBucket,
} from './timesheetLogic';

const seg = (grossHours: number, travelHours = 0): PaySegment => ({
  orchardId: 'o1', checkIn: null, checkOut: null, open: false, breakStart: null, grossHours, travelHours,
});

describe('splitDayHoursBySegment', () => {
  it('splits the paid hours of the day by gross + travel time', () => {
    const out = splitDayHoursBySegment(['a', 'b'], { hours: 7.5, segments: [seg(3, 0.5), seg(4.5, 0)] });
    // pesos 3.5 / 4.5 de 8
    expect(out.get('a')).toBe(3.28);
    expect(out.get('b')).toBe(4.22);
  });

  it('gives 0 h when there is no day calculation or no segment for the shift', () => {
    expect(splitDayHoursBySegment(['a'], undefined).get('a')).toBe(0);
    expect(splitDayHoursBySegment(['a', 'b'], { hours: 4, segments: [seg(4)] }).get('b')).toBe(0);
  });
});

describe('buildTimesheetEntry', () => {
  const att = (over: Partial<AttendanceForTimesheet> = {}): AttendanceForTimesheet => ({
    id: 's1', picker_id: 'p1', date: '2026-10-13',
    check_in: '2026-10-12T19:00:00Z', check_out: '2026-10-13T03:30:00Z',
    verified_by: null, orchard_id: 'o1', ...over,
  });

  it('uses the share of the day when known', () => {
    const e = buildTimesheetEntry(att(), 'Aroha', 7.25, '2026-10-13');
    expect(e).toMatchObject({ hours_worked: 7.25, picker_name: 'Aroha', is_verified: false, requires_review: false, break_minutes: PAY_RULES.mealBreakMinutes });
  });

  it('falls back to the shift itself (8.5 h; only a recorded break is deducted)', () => {
    const e = buildTimesheetEntry(att(), undefined, undefined, '2026-10-13');
    expect(e.hours_worked).toBe(8.5);
    const withBreak = buildTimesheetEntry(att({ break_start: '2026-10-12T23:00:00Z' }), undefined, undefined, '2026-10-13');
    expect(withBreak.hours_worked).toBe(8);
    expect(e.picker_name).toBe('Unknown');
  });

  it('open shift counts 0 h; open shift from a past day needs review', () => {
    const today = buildTimesheetEntry(att({ check_out: null }), 'A', undefined, '2026-10-13', new Date('2026-10-13T03:00:00Z'));
    expect(today.hours_worked).toBe(0);
    expect(today.requires_review).toBe(false);
    expect(today.long_shift).toBeUndefined();
    const stale = buildTimesheetEntry(att({ check_out: null, date: '2026-10-12' }), 'A', undefined, '2026-10-13');
    expect(stale.requires_review).toBe(true);
  });

  it('open for more than 14 h, or closed over 14 h without a correction: long shift', () => {
    const open = buildTimesheetEntry(att({ check_out: null }), 'A', undefined, '2026-10-13', new Date('2026-10-13T10:00:00Z'));
    expect(open).toMatchObject({ requires_review: true, long_shift: true, hours_worked: 0 });
    const closed = att({ check_out: '2026-10-13T11:00:00Z' }); // 16 h
    const raw = buildTimesheetEntry(closed, 'A', undefined, '2026-10-14');
    expect(raw).toMatchObject({ requires_review: true, long_shift: true, hours_worked: 14 });
    const fixed = buildTimesheetEntry({ ...closed, corrected_at: '2026-10-14T00:00:00Z' }, 'A', undefined, '2026-10-14');
    expect(fixed.long_shift).toBeUndefined();
    expect(fixed.hours_worked).toBe(16);
    expect(fixed.requires_review).toBe(true); // > 14 h: se sigue señalando, pero ya se puede aprobar
  });

  it('more than 14 h needs review; verified shifts are marked', () => {
    const e = buildTimesheetEntry(att({ verified_by: 'tl1' }), 'A', 14.5, '2026-10-13');
    expect(e.requires_review).toBe(true);
    expect(e.is_verified).toBe(true);
  });
});

describe('buckets per segment', () => {
  const segs = groupSegmentsByPicker([
    { id: 'pm', picker_id: 'p1', check_in: '2026-10-13T01:00:00Z' },
    { id: 'am', picker_id: 'p1', check_in: '2026-10-12T19:00:00Z' },
  ]);

  it('orders each person segments by check-in', () => {
    expect(segs.get('p1')?.map(s => s.id)).toEqual(['am', 'pm']);
  });

  it('each bucket goes to the last segment started before the scan; rejects do not pay', () => {
    const b = (scanned_at: string, quality_grade: string | null = 'A'): DayBucket => ({
      picker_id: 'p1', orchard_id: 'o1', variety: null, scanned_at, quality_grade,
    });
    const out = assignBucketsToSegments(
      [b('2026-10-12T20:00:00Z'), b('2026-10-13T02:00:00Z'), b('2026-10-13T02:10:00Z', 'reject'), b('2026-10-12T18:00:00Z', null)],
      segs,
      () => 6.5
    );
    expect(out.get('am')).toEqual({ total: 2, rejected: 0, earnings: 13, grades: { A: 1, ungraded: 1 } });
    expect(out.get('pm')).toEqual({ total: 1, rejected: 1, earnings: 6.5, grades: { A: 1, reject: 1 } });
  });

  it('ignores buckets of people without a segment here', () => {
    const out = assignBucketsToSegments([{ picker_id: 'x', orchard_id: null, variety: null, scanned_at: '', quality_grade: 'A' }], segs, () => 1);
    expect(out.size).toBe(0);
  });
});

describe('dayTopUpFor', () => {
  it('with the whole day, this orchard gets its share and minimum is hours x wage', () => {
    const r = dayTopUpFor({
      day: { byOrchard: [{ orchardId: 'o1', topUp: 12.5 } as never], belowMinimum: true, isPublicHoliday: false },
      orchardId: 'o1', hours: 8, minWageRate: 20, pieceRate: 6.5, localBuckets: 0, localEarnings: 0, isPublicHoliday: false,
    });
    // el mínimo nunca baja del mínimo legal
    expect(r).toEqual({ topUp: 12.5, belowMinimum: true, minimum: Math.round(8 * PAY_RULES.minWageFloor * 100) / 100 });
  });

  it('public holiday minimum is time and a half', () => {
    const r = dayTopUpFor({
      day: { byOrchard: [{ orchardId: 'o1', topUp: 0 } as never], belowMinimum: false, isPublicHoliday: true },
      orchardId: 'o1', hours: 2, minWageRate: 30, pieceRate: 6.5, localBuckets: 0, localEarnings: 0, isPublicHoliday: true,
    });
    expect(r.minimum).toBe(90);
  });

  it('without the whole day, computes only with this orchard numbers', () => {
    const r = dayTopUpFor({
      day: undefined, orchardId: 'o1', hours: 8, minWageRate: PAY_RULES.minWageFloor, pieceRate: 6.5,
      localBuckets: 10, localEarnings: 65, isPublicHoliday: false,
    });
    expect(r.belowMinimum).toBe(true);
    expect(r.topUp).toBeCloseTo(8 * PAY_RULES.minWageFloor - 65, 2);
  });
});

describe('buildDailyRecord', () => {
  const ts = { id: 's1', picker_id: 'p1', hours_worked: 8 } as TimesheetEntry;

  it('top-up and minimum only on the last segment', () => {
    const day = { topUp: 20, belowMinimum: true, minimum: 191.6 };
    const info = { total: 10, rejected: 1, earnings: 65.004, grades: { A: 10 } };
    const last = buildDailyRecord(ts, info, true, day, 6.5, false);
    expect(last).toMatchObject({ piece_earnings: 65, top_up: 20, minimum_required: 191.6, total_earnings: 85, pay_type: 'hourly_topup', buckets_rejected: 1 });
    const first = buildDailyRecord(ts, info, false, day, 6.5, false);
    expect(first).toMatchObject({ top_up: 0, minimum_required: 0, total_earnings: 65, is_below_minimum: true });
  });

  it('public holiday adds half the piece earnings', () => {
    const r = buildDailyRecord(ts, { total: 10, rejected: 0, earnings: 65, grades: {} }, true, undefined, 6.5, true);
    expect(r.total_earnings).toBe(97.5);
    expect(r.pay_type).toBe('piece_rate');
  });

  it('no buckets: zeros', () => {
    expect(buildDailyRecord(ts, undefined, true, undefined, 6.5, false)).toMatchObject({ buckets_total: 0, piece_earnings: 0, total_earnings: 0, quality_grades: {} });
  });
});
