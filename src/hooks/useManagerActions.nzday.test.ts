import { describe, it, expect } from 'vitest';
import { bucketsOfNZDay } from './useManagerActions';

// Las cubetas de la mañana NZ tienen fecha UTC del día anterior
describe('bucketsOfNZDay', () => {
  const today = '2026-10-18'; // NZDT (UTC+13)

  it('keeps morning scans whose UTC date is the previous day', () => {
    const rows = [
      { id: 'a', scanned_at: '2026-10-17T19:30:00.000Z' }, // 08:30 NZ
      { id: 'b', scanned_at: '2026-10-17T23:59:00.000Z' }, // 12:59 NZ
      { id: 'c', scanned_at: '2026-10-18T00:30:00.000Z' }, // 13:30 NZ
    ];
    expect(bucketsOfNZDay(rows, today).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops yesterday NZ and rows without a timestamp', () => {
    const rows = [
      { id: 'y', scanned_at: '2026-10-17T10:00:00.000Z' }, // 23:00 NZ del 17
      { id: 'n', scanned_at: null },
      { id: 'k', scanned_at: null, created_at: '2026-10-17T20:00:00.000Z' },
    ];
    expect(bucketsOfNZDay(rows, today).map(r => r.id)).toEqual(['k']);
  });
});
