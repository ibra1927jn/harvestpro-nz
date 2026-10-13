/**
 * INTEGRATION — Payroll pipeline contra Supabase real (ct4-bot docker).
 *
 * Verifica el flow:
 *   1. Auth service_role
 *   2. Fetch attendance + bucket_records del día con scans
 *   3. Invoca edge function calculate-payroll con warmup (manager auth)
 *   4. Verifica PickerBreakdown schema incluye hours_ordinary/hours_holiday/
 *      alternative_holidays_owed (Holidays Act s.50+s.60)
 *
 * Salta si credenciales no están disponibles.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { PickerBreakdownSchema, PayrollResultSchema } from '@/schemas/api.schemas';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP = !URL || !SERVICE_KEY;

describe.skipIf(SKIP)('Payroll real Supabase integration', () => {
    let client: SupabaseClient;

    beforeAll(async () => {
        client = createClient(URL!, SERVICE_KEY!);
    });

    it('harvest_settings tiene min_wage_rate >= 23.95 (Minimum Wage Order 2026)', async () => {
        const { data, error } = await client
            .from('harvest_settings')
            .select('orchard_id, min_wage_rate')
            .limit(10);
        expect(error).toBeNull();
        for (const row of data || []) {
            expect(Number((row as { min_wage_rate: number }).min_wage_rate)).toBeGreaterThanOrEqual(23.95);
        }
    });

    it('harvest_settings tiene shift_start_time + shift_end_time defaults', async () => {
        const { data, error } = await client
            .from('harvest_settings')
            .select('orchard_id, shift_start_time, shift_end_time')
            .limit(5);
        expect(error).toBeNull();
        for (const row of data || []) {
            const r = row as { shift_start_time: string | null; shift_end_time: string | null };
            expect(r.shift_start_time).toMatch(/^\d{2}:\d{2}/);
            expect(r.shift_end_time).toMatch(/^\d{2}:\d{2}/);
        }
    });

    it('bucket_records tienen orchard_id + picker_id + scanned_at', async () => {
        const { data, error } = await client
            .from('bucket_records')
            .select('id, orchard_id, picker_id, scanned_at')
            .limit(5);
        expect(error).toBeNull();
        for (const row of data || []) {
            const r = row as { orchard_id: string; picker_id: string; scanned_at: string };
            expect(r.orchard_id).toBeTruthy();
            expect(r.picker_id).toBeTruthy();
            expect(Date.parse(r.scanned_at)).toBeGreaterThan(0);
        }
    });

    it('daily_attendance tiene FK + check_in', async () => {
        const { data, error } = await client
            .from('daily_attendance')
            .select('id, picker_id, orchard_id, date, check_in, check_out')
            .limit(5);
        expect(error).toBeNull();
        for (const row of data || []) {
            const r = row as { picker_id: string; date: string };
            expect(r.picker_id).toBeTruthy();
            expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
        }
    });

    it('calculate-payroll edge function responde a warmup (auth check)', async () => {
        const { error } = await client.functions.invoke('calculate-payroll', {
            body: { _warmup: true },
        });
        // Warmup fails auth (requireRole) porque service_role no es 'manager'/'admin'.
        // Esto confirma que la función está DEPLOYADA y el auth check activo.
        // Nota: en prod el cliente SPA envía JWT de manager con login real.
        // (toBeDefined() aceptaba también null, es decir, un 200)
        expect(error).toBeInstanceOf(FunctionsHttpError);
        expect((error as FunctionsHttpError).context.status).toBe(401);
    });

    it('PayrollResultSchema valida un shape con hours_ordinary/hours_holiday/alt_days', () => {
        const sample = {
            orchard_id: 'o1',
            date_range: { start: '2026-04-01', end: '2026-04-07' },
            summary: {
                total_buckets: 100,
                total_hours: 16,
                total_piece_rate_earnings: 650,
                total_top_up: 0,
                total_earnings: 650,
                total_alternative_holidays_owed: 1,
            },
            compliance: { workers_below_minimum: 0, workers_total: 2, compliance_rate: 100 },
            picker_breakdown: [
                {
                    picker_id: 'p1',
                    picker_name: 'Alice',
                    buckets: 50,
                    hours_worked: 8,
                    hours_ordinary: 6,
                    hours_holiday: 2,
                    alternative_holidays_owed: 1,
                    piece_rate_earnings: 325,
                    hourly_rate: 40.625,
                    minimum_required: 215.55,
                    top_up_required: 0,
                    total_earnings: 325,
                    is_below_minimum: false,
                },
            ],
            settings: { bucket_rate: 6.5, min_wage_rate: 23.95 },
        };
        const r = PayrollResultSchema.safeParse(sample);
        expect(r.success).toBe(true);
    });

    it('PickerBreakdownSchema acepta fila con los 3 campos nuevos de Holidays Act', () => {
        const row = {
            picker_id: 'p1',
            picker_name: 'Bob',
            buckets: 30,
            hours_worked: 5,
            hours_ordinary: 5,
            hours_holiday: 0,
            alternative_holidays_owed: 0,
            piece_rate_earnings: 195,
            hourly_rate: 39,
            minimum_required: 119.75,
            top_up_required: 0,
            total_earnings: 195,
            is_below_minimum: false,
        };
        expect(PickerBreakdownSchema.safeParse(row).success).toBe(true);
    });
});
