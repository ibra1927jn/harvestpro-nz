// deno test --allow-all supabase/functions/_shared/attendance_access_test.ts
// Regla de quién ficha / corrige a quién (sin red).
import { attendanceDenialReason, lockedPeriodError, type AttendanceCaller } from './attendance-access.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ORCH = 'orch-a';
const tl: AttendanceCaller = { id: 'tl-1', role: 'team_leader', orchardId: ORCH };
const manager: AttendanceCaller = { id: 'm-1', role: 'manager', orchardId: ORCH };
const admin: AttendanceCaller = { id: 'a-1', role: 'admin', orchardId: null };

Deno.test('team leader: own team and people without a team are allowed', () => {
  assert(attendanceDenialReason(tl, { id: 'p1', team_leader_id: 'tl-1' }, ORCH) === null, 'own team');
  assert(attendanceDenialReason(tl, { id: 'p2', team_leader_id: null }, ORCH) === null, 'no team');
});

Deno.test('team leader: another team, unknown person or another orchard are refused', () => {
  assert(attendanceDenialReason(tl, { id: 'p3', team_leader_id: 'tl-2' }, ORCH)?.includes('own team') === true, 'other team');
  assert(attendanceDenialReason(tl, null, ORCH) !== null, 'unknown person');
  assert(attendanceDenialReason(tl, { id: 'p1', team_leader_id: 'tl-1' }, 'orch-b') !== null, 'other orchard');
});

Deno.test('manager: whole own orchard, never another one', () => {
  assert(attendanceDenialReason(manager, { id: 'p3', team_leader_id: 'tl-2' }, ORCH) === null, 'any team');
  assert(attendanceDenialReason(manager, null, 'orch-b') !== null, 'other orchard');
  assert(attendanceDenialReason({ ...manager, orchardId: null }, null, ORCH) !== null, 'manager without orchard');
});

Deno.test('admin: anywhere; other roles: never', () => {
  assert(attendanceDenialReason(admin, null, 'orch-b') === null, 'admin');
  assert(attendanceDenialReason({ id: 'r', role: 'runner', orchardId: ORCH }, { id: 'p', team_leader_id: null }, ORCH) !== null, 'runner');
});

Deno.test('nobody but admin touches their own attendance', () => {
  assert(attendanceDenialReason(tl, null, ORCH, 'tl-1')?.includes('own attendance') === true, 'team leader self');
  assert(attendanceDenialReason(manager, null, ORCH, 'm-1') !== null, 'manager self');
  assert(attendanceDenialReason(admin, null, ORCH, 'a-1') === null, 'admin self');
});

Deno.test('closed day / closed pay week map to 409 with the code first', () => {
  const day = lockedPeriodError('DAY_CLOSED: day 2026-10-20 is closed for this orchard.');
  assert(day?.status === 409 && day.message.startsWith('DAY_CLOSED'), 'day closed');
  const week = lockedPeriodError('PAY_WEEK_CLOSED: the pay week containing 2026-10-20 is closed.');
  assert(week?.status === 409 && week.message.startsWith('PAY_WEEK_CLOSED'), 'week closed');
  assert(lockedPeriodError('duplicate key') === null, 'other errors untouched');
});
