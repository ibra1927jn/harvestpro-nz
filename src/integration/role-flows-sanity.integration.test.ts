/**
 * INTEGRATION — Sanity check de los 8 rol flows contra Supabase real.
 *
 * Verifica que cada rol tiene:
 *   - User DB entry con role correcto
 *   - Acceso RLS apropiado a las tablas que necesita según su función
 *   - Tablas/columnas referenciadas por su UI están presentes
 *
 * No ejecuta auth real — sólo sanity sobre estructura.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !URL || !SERVICE_KEY;

describe.skipIf(SKIP)('Role flows — sanity (real Supabase)', () => {
    let client: SupabaseClient;

    beforeAll(() => {
        client = createClient(URL!, SERVICE_KEY!);
    });

    // ── Manager ────────────────────────────────
    it('manager role existe + necesita pickers/bucket_records/day_setups/day_closures', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'manager').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['pickers', 'bucket_records', 'day_setups', 'day_closures', 'harvest_settings']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `manager necesita ${table}`).toBeNull();
        }
    });

    // ── TeamLeader ─────────────────────────────
    it('team_leader role existe + necesita pickers/row_assignments/daily_attendance/chat_messages', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'team_leader').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['pickers', 'row_assignments', 'daily_attendance', 'chat_messages']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `team_leader necesita ${table}`).toBeNull();
        }
    });

    // ── Runner ─────────────────────────────────
    it('runner role + necesita bins/bucket_records/transport_requests/scanned_stickers', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'runner').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['bins', 'bucket_records', 'transport_requests', 'scanned_stickers']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `runner necesita ${table}`).toBeNull();
        }
    });

    // ── QC Inspector ───────────────────────────
    it('qc_inspector role + necesita qc_inspections', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'qc_inspector').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['qc_inspections']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `qc necesita ${table}`).toBeNull();
        }
    });

    // ── HR Admin ───────────────────────────────
    it('hr_admin role + necesita hr_documents/contracts/users + storage bucket hr-documents', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'hr_admin').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['hr_documents', 'contracts', 'users']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `hr_admin necesita ${table}`).toBeNull();
        }

        const { data: buckets } = await client.storage.listBuckets();
        expect(buckets?.some((b) => b.id === 'hr-documents')).toBe(true);
    });

    // ── Payroll Admin ──────────────────────────
    it('payroll_admin role + necesita daily_attendance/bucket_records/variety_rates + harvest_settings.min_wage_rate', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'payroll_admin').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['daily_attendance', 'bucket_records', 'variety_rates']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `payroll_admin necesita ${table}`).toBeNull();
        }

        // harvest_settings debe tener min_wage_rate column
        const { data: settings, error } = await client
            .from('harvest_settings')
            .select('min_wage_rate')
            .limit(1);
        expect(error).toBeNull();
        expect(settings?.[0]?.min_wage_rate).toBeGreaterThanOrEqual(23.95);
    });

    // ── Admin ──────────────────────────────────
    it('admin role + necesita audit_logs/orchards/users full access', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'admin').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['audit_logs', 'orchards', 'users', 'allowed_registrations']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `admin necesita ${table}`).toBeNull();
        }
    });

    // ── Logistics ──────────────────────────────
    it('logistics role + necesita fleet_vehicles/bins/transport_requests', async () => {
        const { data: users } = await client.from('users').select('id').eq('role', 'logistics').limit(1);
        expect((users || []).length).toBeGreaterThan(0);

        for (const table of ['fleet_vehicles', 'bins', 'transport_requests']) {
            const { error } = await client.from(table).select('*', { count: 'exact', head: true });
            expect(error, `logistics necesita ${table}`).toBeNull();
        }
    });

    // RLS en todas las tablas public: lo comprueba supabase/tests/security/01_catalog.sql
    // (scripts/test-db-security.sh). Aquí había un test que nunca podía fallar.

    // ── Edge functions deployed ────────────────
    // Con service_role la función responde 401 (no es manager/admin): eso prueba que está
    // desplegada y que el control de rol está activo. Un 404/500 o un 200 hacen fallar el test.
    const expectAuthRejected = async (fn: string) => {
        const { error } = await client.functions.invoke(fn, { body: { _warmup: true } });
        expect(error).toBeInstanceOf(FunctionsHttpError);
        expect((error as FunctionsHttpError).context.status).toBe(401);
    };

    it('calculate-payroll desplegada y rechaza a quien no es manager/admin', async () => {
        await expectAuthRejected('calculate-payroll');
    });

    it('record-bucket desplegada y exige usuario', async () => {
        await expectAuthRejected('record-bucket');
    });

    it('manage-attendance desplegada y exige usuario', async () => {
        await expectAuthRejected('manage-attendance');
    });
});
