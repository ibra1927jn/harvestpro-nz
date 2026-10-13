import { describe, it, expect } from 'vitest';
import type { Bin, BucketRecord, Picker, RowAssignment } from '@/types';
import {
  applyAttendanceRecord,
  applyElsewhere,
  applyRowAssignmentEvent,
  deltaSinceISO,
  mapPickerWithAttendance,
  mergeBins,
  mergeBucketDelta,
  mergeCrewDelta,
  rebuildRowAssignmentsFromCrew,
  resolveRowAssignments,
  shouldUseDelta,
  type PickerWithAttendance,
} from './storeSyncLogic';

const picker = (over: Partial<Picker> = {}): Picker =>
  ({ id: 'p1', name: 'Ana', status: 'active', current_row: 0, role: 'picker', ...over }) as Picker;

const ra = (over: Partial<RowAssignment> = {}): RowAssignment => ({
  id: 'ra1',
  row_number: 3,
  side: 'north',
  assigned_pickers: [],
  completion_percentage: 0,
  ...over,
});

describe('shouldUseDelta', () => {
  // 2026-10-13 10:00 NZDT = 2026-10-12T21:00Z
  const lastSyncAt = '2026-10-12T21:00:00Z';

  it('uses delta only when last sync was the same NZ day and data is in memory', () => {
    expect(shouldUseDelta({ lastSyncAt, todayNZ: '2026-10-13', crewCount: 3, bucketCount: 5 })).toBe(true);
  });

  it('compares the NZ date, not the UTC date', () => {
    // En UTC es día 12, en NZ ya es 13
    expect(shouldUseDelta({ lastSyncAt, todayNZ: '2026-10-12', crewCount: 3, bucketCount: 5 })).toBe(false);
  });

  it('falls back to full load after a reload (no buckets in memory) or with no crew', () => {
    expect(shouldUseDelta({ lastSyncAt, todayNZ: '2026-10-13', crewCount: 3, bucketCount: 0 })).toBe(false);
    expect(shouldUseDelta({ lastSyncAt, todayNZ: '2026-10-13', crewCount: 0, bucketCount: 5 })).toBe(false);
    expect(shouldUseDelta({ lastSyncAt: null, todayNZ: '2026-10-13', crewCount: 3, bucketCount: 5 })).toBe(false);
  });
});

describe('deltaSinceISO', () => {
  it('asks for changes two minutes before the last sync', () => {
    expect(deltaSinceISO('2026-10-13T10:02:00.000Z')).toBe('2026-10-13T10:00:00.000Z');
  });
});

describe('mapPickerWithAttendance', () => {
  it('drops deleted shifts and picks the open one as current', () => {
    const row = {
      ...picker(),
      daily_attendance: [
        { id: 'a1', check_in: '2026-10-13T07:00:00Z', check_out: '2026-10-13T09:00:00Z' },
        { id: 'a2', check_in: '2026-10-13T10:00:00Z', check_out: null },
        { id: 'a3', check_in: '2026-10-13T11:00:00Z', check_out: null, deleted_at: '2026-10-13T11:05:00Z' },
      ],
    } as PickerWithAttendance;
    const p = mapPickerWithAttendance(row);
    expect(p.shifts?.map(s => s.id)).toEqual(['a1', 'a2']);
    expect(p.check_in).toBe('2026-10-13T10:00:00Z');
    expect(p.check_out).toBeUndefined();
    expect(p.checked_in_today).toBe(true);
    expect((p as PickerWithAttendance).daily_attendance).toBeUndefined();
  });
});

describe('mergeCrewDelta / mergeBucketDelta', () => {
  it('updates, appends and removes archived or deleted pickers', () => {
    const crew = [picker({ id: 'a', name: 'A' }), picker({ id: 'b', name: 'B' }), picker({ id: 'c' })];
    const incoming = [
      { ...picker({ id: 'a', name: 'A2' }) },
      { ...picker({ id: 'b', status: 'archived' }) },
      { ...picker({ id: 'c' }), deleted_at: '2026-10-13T00:00:00Z' },
      { ...picker({ id: 'd', name: 'D' }) },
    ] as PickerWithAttendance[];
    const out = mergeCrewDelta(crew, incoming);
    expect(out.map(p => [p.id, p.name])).toEqual([
      ['a', 'A2'],
      ['d', 'D'],
    ]);
  });

  it('removes soft-deleted buckets and keeps the rest in place', () => {
    const records = [{ id: '1' }, { id: '2' }] as BucketRecord[];
    const incoming = [{ id: '1', deleted_at: 'x' }, { id: '3' }] as BucketRecord[];
    expect(mergeBucketDelta(records, incoming).map(b => b.id)).toEqual(['2', '3']);
  });
});

describe('applyElsewhere', () => {
  const open = { picker_id: 'p1', orchard_id: 'o2', check_in: '2026-10-13T07:00:00Z', orchards: { name: 'Cromwell' } };

  it('marks a picker working in another orchard', () => {
    const [p] = applyElsewhere([picker()], [open]);
    expect(p.elsewhere).toEqual({ orchard_id: 'o2', orchard_name: 'Cromwell', since: open.check_in });
  });

  it('this orchard wins when the picker is checked in here', () => {
    const here = picker({ check_in: '2026-10-13T08:00:00Z', elsewhere: { orchard_id: 'o9', orchard_name: 'Old' } });
    const [p] = applyElsewhere([here], [open]);
    expect(p.elsewhere).toBeNull();
  });

  it('keeps the same object when nothing changes and names unknown orchards', () => {
    const p = picker();
    expect(applyElsewhere([p], [])[0]).toBe(p);
    const [q] = applyElsewhere([picker()], [{ ...open, orchards: null }]);
    expect(q.elsewhere?.orchard_name).toBe('another orchard');
  });

  it('clears a stale elsewhere mark', () => {
    const p = picker({ elsewhere: { orchard_id: 'o2', orchard_name: 'X' } });
    expect(applyElsewhere([p], [])[0].elsewhere).toBeNull();
  });
});

describe('row assignments', () => {
  it('rebuilds from crew grouped by team and row, team leader included', () => {
    const crew = [
      picker({ id: 'tl', role: 'team_leader', current_row: 4 }),
      picker({ id: 'p1', team_leader_id: 'tl', current_row: 4 }),
      picker({ id: 'p2', team_leader_id: 'tl', current_row: 5 }),
      picker({ id: 'p3', current_row: 0 }),
    ];
    const out = rebuildRowAssignmentsFromCrew(crew);
    expect(out).toEqual([
      { id: 'rebuilt-4-tl', row_number: 4, side: 'north', assigned_pickers: ['tl', 'p1'], completion_percentage: 0 },
      { id: 'rebuilt-5-p2', row_number: 5, side: 'north', assigned_pickers: ['p2'], completion_percentage: 0 },
    ]);
  });

  it('server rows win and get defaults', () => {
    const out = resolveRowAssignments({
      server: [{ id: 's1', row_number: 7, side: null, assigned_pickers: null, completion_percentage: null }],
      serverError: false,
      existing: [ra()],
      crew: [],
    });
    expect(out).toEqual([
      { id: 's1', row_number: 7, side: 'north', assigned_pickers: [], completion_percentage: 0, team_leader_id: null },
    ]);
  });

  it('empty server answer clears stale local ones', () => {
    expect(resolveRowAssignments({ server: [], serverError: false, existing: [ra()], crew: [] })).toEqual([]);
  });

  it('on server error keeps local ones untouched', () => {
    expect(resolveRowAssignments({ server: null, serverError: true, existing: [ra()], crew: [] })).toBeNull();
  });

  it('with nothing anywhere rebuilds from crew, or leaves the store alone', () => {
    const crew = [picker({ id: 'p1', current_row: 2 })];
    expect(resolveRowAssignments({ server: [], serverError: false, existing: [], crew })?.[0].row_number).toBe(2);
    expect(resolveRowAssignments({ server: [], serverError: false, existing: [], crew: [] })).toBeNull();
  });

  it('realtime: upserts active rows and drops deleted or finished ones', () => {
    const list = [ra({ id: 'a' }), ra({ id: 'b', row_number: 9 })];
    const updated = applyRowAssignmentEvent(list, { id: 'a', row_number: 4, status: 'active' }, 'UPDATE');
    expect(updated.map(r => [r.id, r.row_number])).toEqual([
      ['a', 4],
      ['b', 9],
    ]);
    const inserted = applyRowAssignmentEvent(list, { id: 'c', row_number: 1, status: 'active' }, 'INSERT');
    expect(inserted.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(applyRowAssignmentEvent(list, { id: 'a', row_number: 3, status: 'completed' }, 'UPDATE').map(r => r.id)).toEqual(['b']);
    expect(applyRowAssignmentEvent(list, { id: 'b', row_number: 9, deleted_at: 'x' }, 'UPDATE').map(r => r.id)).toEqual(['a']);
    expect(applyRowAssignmentEvent(list, { id: 'a', row_number: 3 }, 'DELETE').map(r => r.id)).toEqual(['b']);
  });
});

describe('applyAttendanceRecord', () => {
  const base = { picker_id: 'p1', date: '2026-10-13', orchard_id: 'o1' };

  it('adds a check-in and clears the elsewhere mark', () => {
    const p = picker({ elsewhere: { orchard_id: 'o2', orchard_name: 'X' } });
    const out = applyAttendanceRecord(p, { ...base, id: 's1', check_in: '2026-10-13T07:00:00Z', check_out: null });
    expect(out.check_in).toBe('2026-10-13T07:00:00Z');
    expect(out.elsewhere).toBeNull();
  });

  it('replaces the same shift on update and removes it on soft delete', () => {
    const p = applyAttendanceRecord(picker(), { ...base, id: 's1', check_in: '2026-10-13T07:00:00Z' });
    const closed = applyAttendanceRecord(p, { ...base, id: 's1', check_in: '2026-10-13T07:00:00Z', check_out: '2026-10-13T15:00:00Z' });
    expect(closed.shifts).toHaveLength(1);
    expect(closed.check_out).toBe('2026-10-13T15:00:00Z');
    const removed = applyAttendanceRecord(closed, { ...base, id: 's1', check_in: null, deleted_at: 'x' });
    expect(removed.shifts).toEqual([]);
    expect(removed.checked_in_today).toBe(false);
  });
});

describe('mergeBins', () => {
  it('keeps local bins not yet on the server, only if they have a code', () => {
    const server = [{ id: 'b1', bin_code: 'B1' }] as Bin[];
    const local = [{ id: 'b1', bin_code: 'B1' }, { id: 'tmp', bin_code: 'NEW' }, { id: 'x' }] as Bin[];
    expect(mergeBins(server, local).map(b => b.id)).toEqual(['b1', 'tmp']);
    expect(mergeBins(server, undefined).map(b => b.id)).toEqual(['b1']);
  });
});
