/**
 * Escribe en audit_logs con las columnas que existen de verdad
 * (user_id, action, table_name, record_id, old_values, new_values).
 *
 * Antes cada función insertaba entity_type / entity_id / performed_by / notes,
 * columnas que no existen: la acción se aplicaba pero la auditoría fallaba, y
 * aprobar o corregir una hoja de horas devolvía error al usuario.
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any }

export interface AuditEntry {
    action: string
    table: string
    recordId: string
    userId: string
    newValues?: Record<string, unknown>
    oldValues?: Record<string, unknown>
    /** Motivo o nota: se guarda dentro de new_values.reason */
    reason?: string
}

export async function writeAudit(supabase: SupabaseLike, entry: AuditEntry): Promise<{ error: { message: string } | null }> {
    // audit_logs.action solo admite INSERT/UPDATE/DELETE/CUSTOM (CHECK): los
    // eventos de negocio van como CUSTOM y su nombre en new_values.event.
    const { error } = await supabase.from('audit_logs').insert({
        action: 'CUSTOM',
        table_name: entry.table,
        record_id: entry.recordId,
        user_id: entry.userId,
        old_values: entry.oldValues ?? null,
        new_values: {
            event: entry.action,
            ...(entry.newValues ?? {}),
            ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
        },
        created_at: new Date().toISOString(),
    })
    return { error }
}
