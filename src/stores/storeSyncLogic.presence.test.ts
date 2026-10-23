/**
 * Presencia sin leer fichajes (presence_today): runner, QC, logística y el
 * team leader fuera de su equipo saben quién está fichado sin ver horas.
 */
import { describe, it, expect } from 'vitest';
import type { Picker } from '@/types';
import { applyPresence, elsewhereFromPresence, refreshPresenceOf, type PresenceRow } from './storeSyncLogic';
import { isPresentToday, selectPresentPickers } from '@/services/harvestMetrics/roster';
import { presenceOf } from '@/services/presence';
import { orderForInspection } from '@/components/views/qc/inspectList';

const picker = (over: Partial<Picker> = {}): Picker =>
  ({ id: 'p1', name: 'Ana', status: 'active', current_row: 0, role: 'picker', ...over }) as Picker;

const row = (over: Partial<PresenceRow> = {}): PresenceRow => ({
  picker_id: 'p1', present: true, since: '2026-10-24T19:00:00Z', on_break: false, on_leave: false,
  checked_in_today: true, left_at: null, elsewhere_orchard_id: null, elsewhere_orchard_name: null, ...over,
});

const NOW = new Date('2026-10-24T23:00:00Z');

describe('applyPresence', () => {
  it('checked in: present, since when, and on break', () => {
    const [p] = applyPresence([picker()], [row({ on_break: true })]);
    expect(p.check_in).toBe('2026-10-24T19:00:00Z');
    expect(p.check_out).toBeUndefined();
    expect(isPresentToday(p)).toBe(true);
    expect(presenceOf(p, false, NOW)).toBe('on_break');
    expect(presenceOf({ ...p, on_break_now: false }, false, NOW)).toBe('on_shift');
  });

  it('already left: not present, shown as left', () => {
    const [p] = applyPresence([picker()], [row({ present: false, since: null, left_at: '2026-10-24T22:00:00Z' })]);
    expect(isPresentToday(p)).toBe(false);
    expect(presenceOf(p, false, NOW)).toBe('left');
  });

  it('no row: not in (and a stale presence is cleared)', () => {
    const stale = picker({ checked_in_today: true, check_in: '2026-10-24T19:00:00Z' });
    const [p] = applyPresence([stale], []);
    expect(isPresentToday(p)).toBe(false);
    expect(presenceOf(p, false, NOW)).toBe('not_in');
  });

  it('on leave without a shift: on leave', () => {
    const [p] = applyPresence([picker()], [row({ present: false, since: null, checked_in_today: false, on_leave: true })]);
    expect(presenceOf(p, true, NOW)).toBe('on_leave');
  });

  it('people with visible shifts (own team, or everyone for the manager) are not touched', () => {
    const visible = picker({ shifts: [{ id: 's1', orchard_id: 'o1', check_in: '2026-10-24T18:00:00Z', check_out: null }], check_in: '2026-10-24T18:00:00Z' });
    const [p] = applyPresence([visible], [row({ present: false, since: null, left_at: 'x' })]);
    expect(p).toBe(visible);
  });

  it('keeps the same object when nothing changes', () => {
    const [first] = applyPresence([picker()], [row()]);
    expect(applyPresence([first], [row()])[0]).toBe(first);
  });

  it('the QC list puts the people checked in first', () => {
    const crew = applyPresence([picker({ id: 'a', name: 'A' }), picker({ id: 'b', name: 'B' })], [row({ picker_id: 'b' })]);
    expect(orderForInspection(crew, new Set()).map(x => x.picker.id)[0]).toBe('b');
    expect(selectPresentPickers(crew).map(p => p.id)).toEqual(['b']);
  });
});

describe('elsewhere from presence', () => {
  it('lists who is working now in another orchard', () => {
    expect(elsewhereFromPresence([row({ present: false, elsewhere_orchard_id: 'o2', elsewhere_orchard_name: 'Cromwell' })]))
      .toEqual([{ picker_id: 'p1', orchard_id: 'o2', check_in: null, orchards: { name: 'Cromwell' } }]);
  });

  it('refresh: marks elsewhere for people without visible shifts, leaves the rest', () => {
    const visible = picker({ id: 'v', shifts: [{ id: 's', orchard_id: 'o1', check_in: 'x', check_out: null }], elsewhere: null });
    const [away, v] = refreshPresenceOf([picker({ id: 'p1' }), visible], [
      row({ present: false, since: null, checked_in_today: false, elsewhere_orchard_id: 'o2', elsewhere_orchard_name: 'Cromwell' }),
      row({ picker_id: 'v', present: false, elsewhere_orchard_id: 'o3', elsewhere_orchard_name: 'Alex' }),
    ]);
    expect(away.elsewhere).toEqual({ orchard_id: 'o2', orchard_name: 'Cromwell', since: null });
    expect(v).toBe(visible);
  });
});
