/**
 * User Service Repository — Domain queries for users, pickers, and daily_attendance tables
 * Used by user.service.ts for cross-table user management operations
 */
import { supabase } from '@/services/supabase';

export const userServiceRepository = {
    /** Get user profile by ID */
    async getUserById(userId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    /** Get users by orchard */
    async getUsersByOrchard(orchardId: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('orchard_id', orchardId)
            .order('role');
        if (error) throw error;
        return data || [];
    },

    /** Get available users (active, with optional role filter) */
    async getAvailableUsers(role?: string) {
        let query = supabase
            .from('users')
            .select('id, full_name, role, orchard_id')
            .eq('is_active', true);
        if (role) query = query.eq('role', role);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    /** Get users by role */
    async getUsersByRole(role: string) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('role', role)
            .order('full_name');
        if (error) throw error;
        return data || [];
    },

    /** Update user orchard assignment */
    async updateUserOrchard(userId: string, orchardId: string | null) {
        const updatePayload = orchardId
            ? { orchard_id: orchardId, is_active: true }
            : { orchard_id: null };

        const { data, error } = await supabase
            .from('users')
            .update(updatePayload)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Clear user orchard assignment */
    async clearUserOrchard(userId: string) {
        const { error } = await supabase
            .from('users')
            .update({ orchard_id: null })
            .eq('id', userId);
        if (error) throw error;
    },

    /** Check if picker record exists */
    async findPickerById(userId: string) {
        const { data } = await supabase
            .from('pickers')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        return data;
    },

    /** Update picker record */
    async updatePicker(userId: string, updates: Record<string, unknown>) {
        const { error } = await supabase
            .from('pickers')
            .update(updates)
            .eq('id', userId);
        return { error };
    },

    /** Insert picker record */
    async insertPicker(payload: Record<string, unknown>) {
        const { error } = await supabase
            .from('pickers')
            .insert(payload);
        return { error };
    },

    /** Delete picker record */
    async deletePicker(userId: string) {
        const { error } = await supabase
            .from('pickers')
            .delete()
            .eq('id', userId);
        return { error };
    },

    /** Verify picker state (for RLS bypass detection) */
    async verifyPickerState(userId: string) {
        const { data } = await supabase
            .from('pickers')
            .select('id, orchard_id, status')
            .eq('id', userId)
            .maybeSingle();
        return data;
    },

    /** Tramo abierto de hoy (puede haber varios tramos al día; como mucho uno abierto) */
    async findTodayAttendance(userId: string, today: string) {
        const { data } = await supabase
            .from('daily_attendance')
            .select('id, orchard_id')
            .eq('picker_id', userId)
            .eq('date', today)
            .is('check_out', null)
            .is('deleted_at', null)
            .limit(1);
        return data?.[0] ?? null;
    },

    /** Insert attendance record */
    async insertAttendance(payload: Record<string, unknown>) {
        const { error } = await supabase
            .from('daily_attendance')
            .insert(payload);
        return { error };
    },
};
