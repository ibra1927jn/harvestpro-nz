/**
 * Payroll Exports Repository — tabla payroll_exports (migración 20261023046000).
 * Historial de exportaciones de nómina en el servidor (antes en localStorage).
 */
import { supabase } from '@/services/supabase';
import { fetchAllRows } from '@/utils/fetchAllRows';

export type PayrollExportFormat = 'csv' | 'xero' | 'paysauce' | 'pdf';

export interface PayrollExportRow {
    id: string;
    exported_by: string;
    exported_at: string;
    week_start: string;
    week_end: string;
    format: PayrollExportFormat;
    filename: string;
    record_count: number;
    total_earnings: number | string;
    week_status: 'draft' | 'final' | null;
}

export interface NewPayrollExport {
    week_start: string;
    week_end: string;
    format: PayrollExportFormat;
    filename: string;
    record_count: number;
    total_earnings: number;
    week_status?: 'draft' | 'final' | null;
}

const COLUMNS = 'id, exported_by, exported_at, week_start, week_end, format, filename, record_count, total_earnings, week_status';

export const payrollExportsRepository = {
    /** Todo el historial, la más reciente primero */
    async list(): Promise<PayrollExportRow[]> {
        const rows = await fetchAllRows<PayrollExportRow>((from, to) =>
            supabase.from('payroll_exports').select(COLUMNS).order('id').range(from, to));
        return [...rows].sort((a, b) => b.exported_at.localeCompare(a.exported_at));
    },

    async log(rec: NewPayrollExport): Promise<PayrollExportRow> {
        const { data, error } = await supabase.from('payroll_exports').insert(rec).select(COLUMNS).single();
        if (error) throw error;
        return data as PayrollExportRow;
    },

    async remove(id: string): Promise<void> {
        const { data, error } = await supabase.from('payroll_exports').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Export record not deleted (no permission or not found)');
    },
};
