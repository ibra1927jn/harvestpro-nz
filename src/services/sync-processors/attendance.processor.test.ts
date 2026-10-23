/**
 * attendance.processor — los elementos ATTENDANCE de la cola van por
 * manage-attendance (pase de lista y formato antiguo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import { attendanceService } from '../attendance.service';

describe('processAttendance — roll call queued without signal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('check_in goes to manage-attendance with the phone shift id and time', async () => {
    const spy = vi.spyOn(attendanceService, 'checkInPicker').mockResolvedValue(undefined as never);
    const { processAttendance } = await import('./attendance.processor');
    await processAttendance({ action: 'check_in', picker_id: 'p-1', orchard_id: 'o-1', attendance_id: 'c-1', at: '2026-10-23T08:00:00.000Z', clock_skew_ms: 180_000 });
    expect(spy).toHaveBeenCalledWith('p-1', 'o-1', undefined, {
      clientId: 'c-1', at: '2026-10-23T08:00:00.000Z', skewApplied: 180_000, pickerId: 'p-1',
    });
  });

  it('breaks and check-out use the shift and fall back to the person', async () => {
    const brk = vi.spyOn(attendanceService, 'recordBreak').mockResolvedValue(undefined as never);
    const out = vi.spyOn(attendanceService, 'checkOutPicker').mockResolvedValue(undefined as never);
    const { processAttendance } = await import('./attendance.processor');
    await processAttendance({ action: 'break_end', picker_id: 'p-1', orchard_id: 'o-1', attendance_id: 'c-1', at: 'T' });
    await processAttendance({ action: 'check_out', picker_id: 'p-1', orchard_id: 'o-1', attendance_id: 'c-1', at: 'T' });
    // Elementos de una versión anterior (sin clock_skew_ms): sin corrección conocida
    expect(brk).toHaveBeenCalledWith('break_end', 'c-1', { at: 'T', pickerId: 'p-1', skewApplied: undefined });
    expect(out).toHaveBeenCalledWith('c-1', { at: 'T', pickerId: 'p-1', skewApplied: undefined });
  });

  it('a server refusal (4xx) becomes a rejection; a 503 stays retryable', async () => {
    const spy = vi.spyOn(attendanceService, 'checkOutPicker');
    const { processAttendance } = await import('./attendance.processor');
    spy.mockRejectedValueOnce(Object.assign(new Error('PAY_WEEK_CLOSED: closed'), { status: 409 }));
    await expect(processAttendance({ action: 'check_out', picker_id: 'p', orchard_id: 'o', attendance_id: 'c', at: 'T' }))
      .rejects.toMatchObject({ name: 'SyncRejectedError', message: 'PAY_WEEK_CLOSED: closed' });
    spy.mockRejectedValueOnce(Object.assign(new Error('Edge Function failed (503)'), { status: 503 }));
    await expect(processAttendance({ action: 'check_out', picker_id: 'p', orchard_id: 'o', attendance_id: 'c', at: 'T' }))
      .rejects.not.toMatchObject({ name: 'SyncRejectedError' });
  });
});

describe('processAttendance — old format (no action) goes through manage-attendance too', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('a check-out with the phone time becomes a check_out action (no direct table write)', async () => {
    const out = vi.spyOn(attendanceService, 'checkOutPicker').mockResolvedValue(undefined as never);
    const from = vi.spyOn(supabase, 'from');
    const { processAttendance } = await import('./attendance.processor');
    await processAttendance({ picker_id: 'p-1', orchard_id: 'o-1', attendanceId: 'a-1', check_out: '2026-10-23T05:00:00.000Z' }, '2026-10-23T04:00:00Z');
    expect(out).toHaveBeenCalledWith('a-1', { at: '2026-10-23T05:00:00.000Z', pickerId: 'p-1', skewApplied: undefined });
    expect(from).not.toHaveBeenCalled();
  });

  it('a check-in becomes a check_in action with its time', async () => {
    const spy = vi.spyOn(attendanceService, 'checkInPicker').mockResolvedValue(undefined as never);
    const { processAttendance } = await import('./attendance.processor');
    await processAttendance({ picker_id: 'p-1', orchard_id: 'o-1', verifiedBy: 'tl-1', check_in: '2026-10-23T01:00:00.000Z' });
    expect(spy).toHaveBeenCalledWith('p-1', 'o-1', 'tl-1', expect.objectContaining({ at: '2026-10-23T01:00:00.000Z', skewApplied: undefined }));
  });

  it('the server refusing it (day closed) sends it to the failed list with the reason', async () => {
    vi.spyOn(attendanceService, 'checkOutPicker').mockRejectedValueOnce(
      Object.assign(new Error('DAY_CLOSED: this day is closed. Only an admin can change its timesheets.'), { status: 409 }));
    const { processAttendance } = await import('./attendance.processor');
    await expect(processAttendance({ picker_id: 'p', orchard_id: 'o', attendanceId: 'a', check_out: 'T' }))
      .rejects.toMatchObject({ name: 'SyncRejectedError', message: expect.stringContaining('DAY_CLOSED') });
  });
});
