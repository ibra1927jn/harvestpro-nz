/**
 * Export service — la exportación de nómina usa las cifras del cálculo único
 * (desglose de calculate-payroll / buildWeekBreakdown) sin recalcular nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportService } from '../export.service';
import { buildWeekBreakdown } from '@/hooks/useWeeklyReport';
import type { PickerBreakdown } from '../payroll.service';

vi.mock('@/config/analytics', () => ({ analytics: { trackPayrollExport: vi.fn() } }));

const WEEK = { start: '2026-10-05', end: '2026-10-11' };
const t = (date: string, hhmm: string) => `${date}T${hhmm}:00+13:00`;

function row(overrides: Partial<PickerBreakdown>): PickerBreakdown {
    return {
        picker_id: 'p1', picker_name: 'Ana', buckets: 0, hours_worked: 0,
        piece_rate_earnings: 0, hourly_rate: 0, minimum_required: 0,
        top_up_required: 0, total_earnings: 0, is_below_minimum: false,
        ...overrides,
    };
}

describe('exportService.preparePayrollData', () => {
    it('exporta exactamente las cifras del cálculo único de la semana', () => {
        // Ana: lunes 80 cubetas en 9.5 h (sin complemento); martes 10 cubetas en 9.5 h
        const breakdown = buildWeekBreakdown({
            attendance: ['2026-10-05', '2026-10-06'].map(date => ({
                picker_id: 'p1', date, check_in: t(date, '07:00'), check_out: t(date, '17:00'),
            })),
            buckets: [
                ...Array.from({ length: 80 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-05', '10:00') })),
                ...Array.from({ length: 10 }, () => ({ picker_id: 'p1', scanned_at: t('2026-10-06', '10:00') })),
            ],
            crew: [{ id: 'p1', name: 'Ana' }],
            pieceRate: 6.5,
            minWage: 23.95,
        });

        const data = exportService.preparePayrollData(breakdown, WEEK, () => 'EMP001');
        expect(data.crew[0]).toMatchObject({
            employeeId: 'EMP001', name: 'Ana', buckets: 90, hours: 19,
            pieceEarnings: 585, minimumTopUp: 162.53, totalEarnings: 747.53, status: 'topped_up',
        });
        expect(data.summary.grandTotal).toBe(747.53);
        expect(data.date).toBe('2026-10-05_to_2026-10-11');
    });

    it('marca a quien tiene días con horas estimadas', () => {
        const data = exportService.preparePayrollData(
            [row({ picker_id: 'p1', picker_name: 'Ana', estimated_days: 2, hours_worked: 7.5, total_earnings: 179.63 }),
             row({ picker_id: 'p2', picker_name: 'Bea', hours_worked: 8, total_earnings: 191.6 })],
            WEEK,
        );
        expect(data.crew.find(p => p.name === 'Ana')?.status).toBe('check_timesheet');
        expect(data.summary.pickersWithEstimatedDays).toBe(1);
        expect(data.summary.grandTotal).toBe(371.23);
    });

    it('usa el código de empleado si existe y si no el id', () => {
        const data = exportService.preparePayrollData([row({ picker_id: 'uuid-1' })], WEEK, () => undefined);
        expect(data.crew[0].employeeId).toBe('uuid-1');
    });
});

describe('exportService.generateCSV', () => {
    it('incluye la semana, los días estimados y protege contra fórmulas', () => {
        const data = exportService.preparePayrollData(
            [row({ picker_name: '=HYPERLINK("x")', hours_worked: 8, total_earnings: 191.6, estimated_days: 1 })],
            WEEK,
        );
        const csv = exportService.generateCSV(data);
        expect(csv.split('\n')[0]).toBe('Payroll Report - week 2026-10-05 to 2026-10-11');
        expect(csv).toContain('Estimated Days');
        expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
    });
});

describe('exportService.exportPayroll', () => {
    beforeEach(() => vi.restoreAllMocks());

    it.each([
        ['csv', 'payroll-2026-10-05_to_2026-10-11-DRAFT.csv'],
        ['xero', 'xero-payroll-2026-10-05_to_2026-10-11-DRAFT.csv'],
        ['paysauce', 'paysauce-payroll-2026-10-05_to_2026-10-11-DRAFT.csv'],
        ['pdf', 'payroll-report-2026-10-05_to_2026-10-11-DRAFT.html'],
    ] as const)('%s descarga %s y devuelve totales para el historial', (format, filename) => {
        const download = vi.spyOn(exportService, 'downloadFile').mockImplementation(() => {});
        const data = exportService.preparePayrollData([row({ hours_worked: 8, total_earnings: 191.6, top_up_required: 191.6 })], WEEK);
        const result = exportService.exportPayroll(format, data);
        expect(download).toHaveBeenCalledWith(expect.any(String), filename, expect.any(String));
        expect(result).toEqual({ filename, recordCount: 1, totalEarnings: 191.6 });
    });

    it('Xero lleva línea de cubetas y línea de complemento con las horas de la semana', () => {
        const data = exportService.preparePayrollData(
            [row({ buckets: 10, hours_worked: 7.5, piece_rate_earnings: 65, top_up_required: 114.63, total_earnings: 179.63 })],
            WEEK, () => 'EMP001',
        );
        const xero = exportService.generateXeroCSV(data);
        expect(xero).toContain('EMP001,Ana,Piece Rate Earnings,10,6.50,65.00');
        expect(xero).toContain('EMP001,Ana,Minimum Wage Top-Up,7.50');
        expect(xero).toContain('114.63');
    });
});

describe('exportService — semana cerrada y detalle', () => {
    const picker = {
        picker_id: 'p1', picker_name: 'Ana', buckets: 8, hours_worked: 8, piece_rate_earnings: 56.5,
        hourly_rate: 7, minimum_required: 191.6, top_up_required: 135.1, total_earnings: 191.6, is_below_minimum: true,
        days: [{
            date: '2026-10-05', hours: 8, breakMinutes: 30, travelMinutes: 30, buckets: 8,
            bucketsByVariety: { 'Royal Gala': 5, Braeburn: 3 },
            pieceLines: [
                { variety: 'Braeburn', rate: 8, buckets: 3, earnings: 24 },
                { variety: 'Royal Gala', rate: 6.5, buckets: 5, earnings: 32.5 },
            ],
            byOrchard: [
                { orchardId: 'A', hours: 4, buckets: 5, pieceEarnings: 32.5, topUp: 67.55, total: 100.05 },
                { orchardId: 'B', hours: 4, buckets: 3, pieceEarnings: 24, topUp: 67.55, total: 91.55 },
            ],
            segments: [
                { orchardId: 'A', checkIn: '2026-10-04T18:00:00Z', checkOut: '2026-10-04T22:00:00Z', open: false, breakStart: null, grossHours: 4, travelHours: 0.25 },
                { orchardId: 'B', checkIn: '2026-10-04T22:30:00Z', checkOut: '2026-10-05T02:30:00Z', open: false, breakStart: null, grossHours: 4, travelHours: 0.25 },
            ],
            pieceEarnings: 56.5, topUp: 135.1, total: 191.6, belowMinimum: true, estimated: false, isPublicHoliday: false,
        }],
    };
    const names = (id: string | null) => ({ A: 'Orchard A', B: 'Orchard B' } as Record<string, string>)[id ?? ''] ?? '—';

    it('semana cerrada = FINAL, sin "-DRAFT" en el nombre', () => {
        const data = exportService.preparePayrollData([picker], { start: '2026-10-05', end: '2026-10-11' }, () => 'EMP1', { closedAt: '2026-10-12T01:00:00Z', orchardName: names });
        expect(data.status).toBe('final');
        expect(exportService.generateCSV(data).split('\n')[1]).toContain('FINAL');
    });

    it('CSV con detalle por día y coste por huerto', () => {
        const data = exportService.preparePayrollData([picker], { start: '2026-10-05', end: '2026-10-11' }, () => 'EMP1', { orchardName: names });
        const csv = exportService.generateCSV(data);
        expect(csv).toContain('DRAFT');
        expect(csv).toContain('DAILY DETAIL');
        expect(csv).toContain('Orchard A + Orchard B');
        expect(csv).toContain('07:00-11:00 / 11:30-15:30');
        expect(csv).toContain('COST BY ORCHARD');
        expect(data.byOrchard?.map(o => o.total)).toEqual([100.05, 91.55]);
    });

    it('Xero: una línea por variedad con su precio + complemento', () => {
        const data = exportService.preparePayrollData([picker], { start: '2026-10-05', end: '2026-10-11' }, () => 'EMP1', { orchardName: names });
        const xero = exportService.generateXeroCSV(data).split('\n');
        expect(xero).toContain('EMP1,Ana,Piece Rate - Braeburn,3,8.00,24.00');
        expect(xero).toContain('EMP1,Ana,Piece Rate - Royal Gala,5,6.50,32.50');
        expect(xero.some(l => l.startsWith('EMP1,Ana,Minimum Wage Top-Up,8.00,') && l.endsWith(',135.10'))).toBe(true);
    });
});

describe('exportService — festivo', () => {
    it('Xero y PaySauce llevan la línea del plus de festivo y suman el total', () => {
        const p = {
            picker_id: 'p1', picker_name: 'Ana', buckets: 40, hours_worked: 8, piece_rate_earnings: 300, holiday_premium: 150,
            hourly_rate: 37.5, minimum_required: 287.4, top_up_required: 0, total_earnings: 450, is_below_minimum: false,
        };
        const data = exportService.preparePayrollData([p], { start: '2026-10-26', end: '2026-11-01' }, () => 'EMP1');
        const xero = exportService.generateXeroCSV(data).split('\n');
        expect(xero).toContain('EMP1,Ana,Public Holiday Premium,1,150.00,150.00');
        const sum = (csv: string) => csv.split('\n').slice(1).reduce((s, l) => s + Number(l.split(',').pop()), 0);
        expect(sum(exportService.generateXeroCSV(data))).toBeCloseTo(450, 2);
        expect(sum(exportService.generatePaySauceCSV(data))).toBeCloseTo(450, 2);
    });
});

describe('exportService.generateCSV — CSV injection guard keeps columns intact', () => {
    it('a name starting with "=" and containing a comma stays in one quoted cell', async () => {
        const { default: Papa } = await import('papaparse');
        const csv = exportService.generateCSV({
            date: 'w',
            crew: [{ id: '1', name: '=SUM(A1,A2)', employeeId: '-7', buckets: 1, hours: 1, pieceEarnings: 6.5, minimumTopUp: 17.45, totalEarnings: 23.95, status: 'ok' }],
            summary: { totalBuckets: 1, totalHours: 1, totalPieceEarnings: 6.5, totalMinimumTopUp: 17.45, grandTotal: 23.95, averageBucketsPerHour: 1 },
        });
        const row = Papa.parse<string[]>(csv).data.find(r => r[0] === "'-7");
        expect(row?.slice(0, 3)).toEqual(["'-7", "'=SUM(A1,A2)", '1']);
        expect(row).toHaveLength(10);
    });
});
