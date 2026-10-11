/**
 * ExportTab — exporta la semana de pago con las cifras del cálculo único.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PickerBreakdown } from '@/services/payroll.service';

vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('@/config/analytics', () => ({ analytics: { trackPayrollExport: vi.fn() } }));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: unknown) => unknown) =>
        selector({ crew: [{ id: 'p1', picker_id: 'EMP001' }, { id: 'p2', picker_id: 'EMP002' }] }),
}));

import { ExportTab } from './PayrollTabs';
import { exportService } from '@/services/export.service';
import { getExportHistory } from './ExportHistoryTab';

const WEEK = { start: '2026-10-05', end: '2026-10-11', closesOn: '2026-10-12' };
const row = (o: Partial<PickerBreakdown>): PickerBreakdown => ({
    picker_id: 'p1', picker_name: 'Ana', buckets: 10, hours_worked: 7.5, piece_rate_earnings: 65,
    hourly_rate: 8.67, minimum_required: 179.63, top_up_required: 114.63, total_earnings: 179.63,
    is_below_minimum: true, ...o,
});

describe('ExportTab', () => {
    beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

    it('muestra la semana y el total a pagar', () => {
        render(<ExportTab pickers={[row({}), row({ picker_id: 'p2', picker_name: 'Bea', total_earnings: 200 })]} week={WEEK} />);
        expect(screen.getByText(/2026-10-05 → 2026-10-11/)).toBeTruthy();
        expect(screen.getByText('$379.63')).toBeTruthy();
    });

    it('avisa de pickers con horas estimadas', () => {
        render(<ExportTab pickers={[row({ estimated_days: 1 })]} week={WEEK} />);
        expect(screen.getByTestId('export-estimated-warning').textContent).toContain('Ana');
    });

    it('al pulsar Xero descarga el fichero con el código de empleado y lo apunta en el historial', () => {
        const download = vi.spyOn(exportService, 'downloadFile').mockImplementation(() => {});
        render(<ExportTab pickers={[row({})]} week={WEEK} />);
        fireEvent.click(screen.getByText('Xero'));
        const [content, filename] = download.mock.calls[0];
        expect(filename).toBe('xero-payroll-2026-10-05_to_2026-10-11.csv');
        expect(content).toContain('EMP001,Ana,Minimum Wage Top-Up,7.50');
        expect(getExportHistory()[0]).toMatchObject({ format: 'xero', recordCount: 1, totalEarnings: 179.63 });
        expect(screen.getByRole('status').textContent).toContain('xero-payroll');
    });

    it('sin datos los botones están desactivados', () => {
        render(<ExportTab pickers={[]} week={WEEK} />);
        expect((screen.getByText('CSV').closest('button') as HTMLButtonElement).disabled).toBe(true);
    });
});
