/**
 * INTEGRATION — Exportación de datos personales (Privacy Act IPP 6) contra el
 * Supabase local real, con la sesión y RLS de un runner (no service role).
 * Comprueba que las tablas y columnas que lee/escribe el servicio existen.
 *
 * Se salta sin SUPABASE_SERVICE_ROLE_KEY (hace falta para sembrar y limpiar).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !URL || !ANON_KEY || !SERVICE_KEY || URL.includes('placeholder');

// El servicio usa el cliente de la app: aquí, uno real sin persistencia de sesión
vi.mock('@/services/supabase', async () => {
    const { createClient: create } = await import('@supabase/supabase-js');
    const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:1';
    const key = process.env.VITE_SUPABASE_ANON_KEY ?? 'anon';
    return { supabase: create(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
});

import { supabase } from '@/services/supabase';
import { dataExportService } from '@/services/data-export.service';

const RUNNER_EMAIL = 'runner@harvestpro.nz';
const TAG = `data-export-it-${Date.now()}`;

describe.skipIf(SKIP)('data export (IPP 6) — real Supabase, runner session', () => {
    let admin: SupabaseClient;
    let userId = '';
    let orchardId = '';
    let orchardName = '';
    const created = { bucket: '', attendance: '', consent: '' };

    beforeAll(async () => {
        admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false } });
        const { data: signIn, error } = await supabase.auth.signInWithPassword({ email: RUNNER_EMAIL, password: '111111' });
        expect(error).toBeNull();
        userId = signIn.user!.id;

        // El runner también es un picker (mismo id): sus cubos y asistencia son suyos
        const { data: picker } = await admin.from('pickers').select('orchard_id').eq('id', userId).single();
        orchardId = picker!.orchard_id as string;
        const { data: orchard } = await admin.from('orchards').select('name').eq('id', orchardId).single();
        orchardName = orchard!.name as string;

        const now = new Date().toISOString();
        const bucket = await admin.from('bucket_records')
            .insert({ orchard_id: orchardId, picker_id: userId, scanned_at: now, quality_grade: 'A' })
            .select('id').single();
        expect(bucket.error).toBeNull();
        created.bucket = bucket.data!.id as string;

        const att = await admin.from('daily_attendance')
            .insert({ orchard_id: orchardId, picker_id: userId, check_in: now, notes: TAG })
            .select('id').single();
        expect(att.error).toBeNull();
        created.attendance = att.data!.id as string;

        const consent = await admin.from('privacy_consent_log')
            .insert({ user_id: userId, policy_version: TAG })
            .select('id').single();
        expect(consent.error).toBeNull();
        created.consent = consent.data!.id as string;
    });

    afterAll(async () => {
        if (!admin) return;
        if (created.bucket) await admin.from('bucket_records').delete().eq('id', created.bucket);
        if (created.attendance) {
            await admin.from('daily_attendance').delete().eq('id', created.attendance);
            await admin.from('audit_logs').delete().eq('record_id', created.attendance);
        }
        if (created.consent) await admin.from('privacy_consent_log').delete().eq('id', created.consent);
        if (userId) await admin.from('audit_logs').delete().eq('user_id', userId).eq('new_values->>event', 'data_export');
        await supabase.auth.signOut();
    });

    it('exports the profile, own buckets, attendance and consents, and leaves an audit entry', async () => {
        const { data: profile } = await admin.from('users').select('full_name, email').eq('id', userId).single();

        const out = await dataExportService.exportUserData(userId);

        expect(out.user).toMatchObject({ id: userId, email: profile!.email, name: profile!.full_name, role: 'runner' });
        expect(out.bucketScans.map(s => s.id)).toContain(created.bucket);
        expect(out.bucketScans.find(s => s.id === created.bucket)).toMatchObject({ quality_grade: 'A', orchard_id: orchardId });
        const att = out.attendance.find(a => a.id === created.attendance);
        expect(att).toMatchObject({ check_out: null, orchard_name: orchardName });
        expect(out.consentHistory.map(c => c.policy_version)).toContain(TAG);
        expect(typeof out.messageCount).toBe('number');

        // El registro de auditoría de la exportación existe de verdad (lo lee el service role)
        const { data: audit, error } = await admin.from('audit_logs')
            .select('action, table_name, new_values').eq('user_id', userId).eq('new_values->>event', 'data_export');
        expect(error).toBeNull();
        expect(audit).toHaveLength(1);
        expect(audit![0].new_values).toMatchObject({ records_exported: { scans: out.bucketScans.length } });
    });
});
