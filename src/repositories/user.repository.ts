/**
 * User Repository — Domain queries for users table
 */
import { supabase } from '@/services/supabase';
import { fetchInChunks } from '@/utils/fetchInChunks';

/** Persona de la empresa para RRHH */
export interface StaffMember {
    id: string;
    full_name: string;
    email: string;
    role: string;
    active: boolean;
    created_at?: string;
    orchard_id?: string;
    /** Código de picker (LOC-001...), si está en la plantilla */
    code?: string;
    /** staff = plantilla de campo; office = solo cuenta de la app */
    source: 'staff' | 'office';
}

export const userRepository2 = {
    /** Get all users (optionally filtered by orchard) */
    async getAll(orchardId?: string) {
        let query = supabase.from('users').select('*').order('full_name');
        if (orchardId) query = query.eq('orchard_id', orchardId);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /** Get active user count */
    /**
     * Plantilla activa de la empresa: personas de la lista única (pickers,
     * team leaders, runners) que siguen en plantilla. Antes contaba cuentas de
     * la app (users), sin pickers y con managers/admins.
     */
    async getActiveCount(_orchardId?: string) {
        const { count } = await supabase
            .from('pickers')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .is('deleted_at', null);
        return count || 0;
    },

    /** Nombres por id: plantilla (pickers) y, si no está, cuentas de la app (oficina) */
    async getNamesByIds(ids: string[]): Promise<Record<string, string>> {
        if (ids.length === 0) return {};
        // Por trozos: alertas de RRHH con muchas personas daban 414 (URL larga)
        const [staff, users] = await Promise.all([
            fetchInChunks(ids, (chunk, from, to) =>
                supabase.from('pickers').select('id, name').in('id', chunk).order('id').range(from, to),
            ).catch(() => [] as { id: string; name: string | null }[]),
            fetchInChunks(ids, (chunk, from, to) =>
                supabase.from('users').select('id, full_name').in('id', chunk).order('id').range(from, to),
            ).catch(() => [] as { id: string; full_name: string | null }[]),
        ]);
        const out: Record<string, string> = {};
        for (const u of users || []) out[u.id] = u.full_name || 'Unknown';
        for (const p of staff || []) out[p.id] = p.name || out[p.id] || 'Unknown';
        return out;
    },

    /**
     * Empleados de la empresa para RRHH: la plantilla única (pickers, team
     * leaders, runners; la misma lista que Equipos y Nómina) más el personal de
     * oficina que solo tiene cuenta en la app (manager, RRHH, nómina, QC...).
     */
    /** Alta/baja desde RRHH: plantilla → pickers.status, oficina → users.is_active */
    async setActive(id: string, source: 'staff' | 'office', active: boolean): Promise<void> {
        const q = source === 'staff'
            ? supabase.from('pickers').update({ status: active ? 'active' : 'inactive' }).eq('id', id).select('id').maybeSingle()
            : supabase.from('users').update({ is_active: active }).eq('id', id).select('id').maybeSingle();
        const { data, error } = await q;
        if (error) throw error;
        if (!data) throw new Error('Not allowed to change this person');
    },

    async getStaff(): Promise<StaffMember[]> {
        const [{ data: staff, error: staffErr }, { data: users, error: usersErr }] = await Promise.all([
            supabase.from('pickers').select('id, name, role, status, created_at, orchard_id, picker_id').is('deleted_at', null),
            supabase.from('users').select('id, full_name, email, role, is_active, created_at, orchard_id'),
        ]);
        if (staffErr) throw staffErr;
        if (usersErr) throw usersErr;
        const userById = new Map((users || []).map(u => [u.id, u]));
        const out: StaffMember[] = (staff || []).map(p => ({
            id: p.id,
            full_name: p.name,
            email: userById.get(p.id)?.email ?? '',
            role: p.role || 'picker',
            // Baja (inactive/archived) = no activo; antes 'inactive' contaba como activo
            active: p.status !== 'archived' && p.status !== 'inactive',
            created_at: p.created_at ?? undefined,
            orchard_id: p.orchard_id ?? undefined,
            code: p.picker_id,
            source: 'staff',
        }));
        const inStaff = new Set(out.map(s => s.id));
        for (const u of users || []) {
            if (inStaff.has(u.id)) continue;
            out.push({
                id: u.id,
                full_name: u.full_name || 'Unknown',
                email: u.email || '',
                role: u.role || 'office',
                active: !!u.is_active,
                created_at: u.created_at ?? undefined,
                orchard_id: u.orchard_id ?? undefined,
                source: 'office',
            });
        }
        return out.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
};
