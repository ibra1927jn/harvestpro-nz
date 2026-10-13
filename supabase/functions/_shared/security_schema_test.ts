// deno test --allow-all supabase/functions/_shared/security_schema_test.ts
// Esquemas de entrada de las Edge Functions (Zod 4).
import { AdminUpdateRoleSchema, AuditLogBatchSchema } from './security.ts';

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
