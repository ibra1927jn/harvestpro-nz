/**
 * INTEGRATION TEST — HR Documents contra Supabase real (ct4-bot docker)
 *
 * Requiere que SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estén en .env.local
 * y que la tabla hr_documents + bucket hr-documents existan (migration
 * 20260418000000_hr_documents.sql).
 *
 * Si no hay credenciales, los tests se saltan con `skip` automático.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SKIP = !URL || !SERVICE_KEY;

describe.skipIf(SKIP)('hr_documents integration (real Supabase)', () => {
    let client: SupabaseClient;
    let testOrchardId: string | null = null;
    let testUserId: string | null = null;

    beforeAll(async () => {
        client = createClient(URL!, SERVICE_KEY!);
        const { data: orchards } = await client.from('orchards').select('id').limit(1);
        testOrchardId = orchards?.[0]?.id ?? null;
        const { data: users } = await client.from('users').select('id').limit(1);
        testUserId = users?.[0]?.id ?? null;
    });

    it('hr_documents table existe y es queryable con service role', async () => {
        const { error, count } = await client
            .from('hr_documents')
            .select('id', { count: 'exact', head: true });
        expect(error).toBeNull();
        expect(typeof count).toBe('number');
    });

    it('hr-documents bucket existe', async () => {
        const { data, error } = await client.storage.listBuckets();
        expect(error).toBeNull();
        const hrBucket = data?.find((b) => b.id === 'hr-documents');
        expect(hrBucket).toBeTruthy();
        expect(hrBucket?.public).toBe(false);
    });

    it('insertar con service role → devuelve row', async () => {
        // La BD sembrada siempre tiene huerto y usuario: si faltan, el test debe fallar, no saltarse
        expect(testOrchardId).toBeTruthy();
        expect(testUserId).toBeTruthy();
        const { data, error } = await client
            .from('hr_documents')
            .insert({
                orchard_id: testOrchardId,
                user_id: testUserId,
                document_type: 'other',
                title: 'Integration test doc',
                storage_path: `test/${Date.now()}.pdf`,
            })
            .select()
            .single();
        expect(error).toBeNull();
        expect(data).toBeTruthy();
        if (data) {
            expect(data.document_type).toBe('other');
            // cleanup
            await client.from('hr_documents').delete().eq('id', data.id);
        }
    });

    it('CHECK constraint rechaza document_type inválido', async () => {
        expect(testOrchardId && testUserId).toBeTruthy();
        const { error } = await client
            .from('hr_documents')
            .insert({
                orchard_id: testOrchardId,
                user_id: testUserId,
                document_type: 'invalid_type_xyz',
                title: 'Bad',
                storage_path: 'x',
            });
        expect(error).toBeTruthy();
        expect(String(error?.message || '').toLowerCase()).toMatch(/check|constraint|document_type/);
    });

    it('target_check constraint: falla sin picker_id + sin user_id', async () => {
        expect(testOrchardId).toBeTruthy();
        const { error } = await client.from('hr_documents').insert({
            orchard_id: testOrchardId,
            document_type: 'other',
            title: 'No target',
            storage_path: 'x',
        });
        expect(error).toBeTruthy();
    });
});

describe.skipIf(SKIP)('users + orchards sanity (real Supabase)', () => {
    let client: SupabaseClient;
    beforeAll(() => {
        client = createClient(URL!, SERVICE_KEY!);
    });

    it('users table con 8 roles presentes', async () => {
        const { data, error } = await client.from('users').select('role');
        expect(error).toBeNull();
        const roles = new Set((data || []).map((u) => (u as { role: string }).role));
        const expected = ['manager', 'team_leader', 'runner', 'qc_inspector', 'admin', 'hr_admin', 'payroll_admin', 'logistics'];
        for (const r of expected) {
            expect(roles.has(r), `Role ${r} should exist`).toBe(true);
        }
    });

    it('orchards > 0 + tiene crop_type column', async () => {
        const { data, error } = await client.from('orchards').select('id, name, crop_type').limit(5);
        expect(error).toBeNull();
        expect((data || []).length).toBeGreaterThan(0);
    });

    it('bucket_records tiene datos (>0 rows)', async () => {
        const { count, error } = await client
            .from('bucket_records')
            .select('*', { count: 'exact', head: true });
        expect(error).toBeNull();
        expect(count).toBeGreaterThan(0);
    });
});
