/**
 * Invitations Repository — tabla allowed_registrations (B1, auditoría 2026-10-23).
 *
 * Una invitación (email + rol + huerto) es lo que deja darse de alta: el
 * registro la comprueba (check_registration) y guard_user_changes la marca como
 * usada. Solo admin y RRHH la ven y la tocan (RLS, migración 20261023040000);
 * RRHH no puede invitar admins (trigger guard_invitation_role).
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

const COLUMNS = 'id, email, assigned_role, orchard_id, full_name, used_at, expires_at, resent_at, created_by, created_at';

export interface InvitationRow {
    id: string;
    email: string;
    assigned_role: string;
    orchard_id: string | null;
    full_name: string | null;
    used_at: string | null;
    expires_at: string | null;
    resent_at: string | null;
    created_by: string | null;
    created_at: string | null;
}

export interface NewInvitation {
    email: string;
    role: string;
    orchardId: string | null;
    fullName?: string | null;
}

/** Días que vale una invitación (igual que el DEFAULT de la columna) */
export const INVITATION_DAYS = 14;

const expiresFromNow = (now: Date = new Date()): string =>
    new Date(now.getTime() + INVITATION_DAYS * 86_400_000).toISOString();

export const invitationsRepository = {
    /** Todas las invitaciones (pendientes, usadas y caducadas), la más reciente primero */
    async list(): Promise<InvitationRow[]> {
        const rows = await fetchAllRows<InvitationRow>((from, to) =>
            supabase.from('allowed_registrations').select(COLUMNS).order('id').range(from, to)
        );
        return [...rows].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    },

    /** Nueva invitación. Lanza el error de la BD (email repetido, rol no permitido…). */
    async create(inv: NewInvitation): Promise<InvitationRow> {
        const { data, error } = await supabase
            .from('allowed_registrations')
            .insert({
                email: inv.email.trim().toLowerCase(),
                assigned_role: inv.role,
                orchard_id: inv.orchardId,
                full_name: inv.fullName?.trim() || null,
                expires_at: expiresFromNow(),
            })
            .select(COLUMNS)
            .single();
        if (error) throw error;
        return data as InvitationRow;
    },

    /** Reenviar: vuelve a valer otros 14 días desde hoy */
    async resend(id: string): Promise<InvitationRow> {
        const now = new Date();
        const { data, error } = await supabase
            .from('allowed_registrations')
            .update({ expires_at: expiresFromNow(now), resent_at: now.toISOString() })
            .eq('id', id)
            .is('used_at', null)
            .select(COLUMNS);
        if (error) throw error;
        const row = (data ?? [])[0] as InvitationRow | undefined;
        if (!row) throw new Error('Invitation not found or already used');
        return row;
    },

    /** Anular: se borra (el email queda libre para invitarlo otra vez) */
    async revoke(id: string): Promise<void> {
        const { data, error } = await supabase
            .from('allowed_registrations')
            .delete()
            .eq('id', id)
            .is('used_at', null)
            .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Invitation not found or already used');
    },
};
