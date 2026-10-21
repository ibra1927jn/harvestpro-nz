// deno test --allow-all supabase/functions/_shared/security_schema_test.ts
// Esquemas de entrada de las Edge Functions (Zod 4).
import { AdminUpdateRoleSchema, AttendanceInputSchema, AuditLogBatchSchema, ATTENDANCE_BATCH_MAX } from './security.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

Deno.test('AuditLogBatchSchema accepts entries with a details object', () => {
  // Zod 4: z.record(valor) sin clave rompía el parse ("reading '_zod'") y
  // submit-audit-log rechazaba todos los lotes con details
  const parsed = AuditLogBatchSchema.parse({
    entries: [
      {
        event_type: 'bucket.scanned',
        severity: 'info',
        action: 'scan',
        details: { picker: 'P-1', count: 2 },
      },
    ],
  });
  assert(parsed.entries[0].details?.count === 2, 'details must be kept');
});

Deno.test('AuditLogBatchSchema still rejects an empty batch', () => {
  assert(!AuditLogBatchSchema.safeParse({ entries: [] }).success, 'empty batch must fail');
});

Deno.test('AdminUpdateRoleSchema explains which roles are valid', () => {
  // Zod 4 ignora `errorMap`: el mensaje propio no salía y deno check fallaba
  const r = AdminUpdateRoleSchema.safeParse({
    action: 'update_role',
    user_id: '00000000-0000-4000-8000-000000000000',
    new_role: 'god',
  });
  assert(!r.success, 'unknown role must fail');
  const msg = r.success ? '' : r.error.issues[0].message;
  assert(msg.startsWith('Role must be admin, manager'), `custom message expected, got: ${msg}`);
});

// ── manage-attendance: correct_batch ────────────────────────────────

const UUID = '00000000-0000-4000-8000-00000000000';
const uuid = (n: number) => `${UUID}${n}`;

Deno.test('AttendanceInputSchema accepts a correct_batch with optional fields per item', () => {
  const parsed = AttendanceInputSchema.parse({
    action: 'correct_batch',
    reason: 'Everyone left at 16:30',
    admin_id: 'ignored',
    items: [
      { attendance_id: uuid(1), check_out: '2026-10-21T16:30:00+13:00' },
      { attendance_id: uuid(2), check_in: '2026-10-21T07:00:00Z', break_start: null },
      { attendance_id: uuid(3) },
    ],
  });
  assert(parsed.action === 'correct_batch', 'discriminated by action');
  if (parsed.action !== 'correct_batch') return;
  assert(parsed.items.length === 3, 'all items kept');
  assert(parsed.items[1].break_start === null, 'null break_start (remove the break) is kept');
  assert(parsed.items[2].check_in === undefined, 'untouched fields stay undefined');
});

Deno.test('AttendanceInputSchema rejects an empty batch, a short reason and bad ids/dates', () => {
  const base = { action: 'correct_batch', reason: 'Everyone left at 16:30' };
  assert(!AttendanceInputSchema.safeParse({ ...base, items: [] }).success, 'empty batch must fail');
  assert(!AttendanceInputSchema.safeParse({ ...base, reason: 'x', items: [{ attendance_id: uuid(1) }] }).success, 'short reason must fail');
  assert(!AttendanceInputSchema.safeParse({ ...base, items: [{ attendance_id: 'nope' }] }).success, 'non-uuid id must fail');
  assert(!AttendanceInputSchema.safeParse({ ...base, items: [{ attendance_id: uuid(1), check_out: '16:30' }] }).success, 'HH:MM is not a datetime');
});

Deno.test(`AttendanceInputSchema caps a batch at ${ATTENDANCE_BATCH_MAX} items`, () => {
  const items = Array.from({ length: ATTENDANCE_BATCH_MAX + 1 }, (_, i) => ({
    attendance_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  }));
  const tooMany = AttendanceInputSchema.safeParse({ action: 'correct_batch', reason: 'Bulk fix', items });
  assert(!tooMany.success, 'over the cap must fail');
  const justRight = AttendanceInputSchema.safeParse({ action: 'correct_batch', reason: 'Bulk fix', items: items.slice(0, ATTENDANCE_BATCH_MAX) });
  assert(justRight.success, 'at the cap must pass');
});

Deno.test('AttendanceInputSchema still accepts the single correct action', () => {
  const r = AttendanceInputSchema.safeParse({
    action: 'correct', attendance_id: uuid(1), check_out: '2026-10-21T16:30:00+13:00', reason: 'Forgot to check out',
  });
  assert(r.success, 'single correction unchanged');
});
