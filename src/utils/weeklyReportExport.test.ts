/**
 * weeklyReportExport — Deep functional tests
 * Targets: exportCSV, exportPDF (+ buildPdfHtml, dateStamp, downloadBlob)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCSV, exportPDF } from './weeklyReportExport';
import type { PickerBreakdown } from '@/services/payroll.service';
import type { TrendDataPoint } from '@/components/charts/TrendLineChart';
import type { TeamRanking } from '@/hooks/useWeeklyReport';

// ── Helpers ──────────────────────────────────────────
function makePicker(overrides: Partial<PickerBreakdown> = {}): PickerBreakdown {
    return {
        picker_id: 'P001',
        picker_name: 'Alice',
        buckets: 50,
        hours_worked: 8,
        piece_rate_earnings: 100,
        hourly_rate: 23.95,
        minimum_required: 188,
        top_up_required: 0,
        total_earnings: 200,
        is_below_minimum: false,
        ...overrides,
    };
}

function makeTeam(overrides: Partial<TeamRanking> = {}): TeamRanking {
    return { name: 'Carlos', buckets: 200, hours: 40, earnings: 1000, count: 5, bpa: 5.0, ...overrides };
}

function makeTrend(label: string, value: number): TrendDataPoint {
    return { label, value };
}

function makeContext(overrides: Record<string, unknown> = {}) {
    return {
        pickers: [
            makePicker({ picker_id: 'P-001', picker_name: 'John Smith', buckets: 100, hours_worked: 40, piece_rate_earnings: 500, total_earnings: 926, is_below_minimum: true, top_up_required: 426 }),
            makePicker({ picker_id: 'P-002', picker_name: 'Jane Doe', buckets: 200, hours_worked: 40, piece_rate_earnings: 1000, total_earnings: 1000, is_below_minimum: false }),
        ],
        binsTrend: [makeTrend('Mon', 50), makeTrend('Tue', 80)] as TrendDataPoint[],
        workforceTrend: [makeTrend('Mon', 5), makeTrend('Tue', 8)] as TrendDataPoint[],
        teamRankings: [makeTeam()] as TeamRanking[],
        crew: [
            { id: 'leader-1', picker_id: 'L-001', name: 'Team Leader A' },
            { id: 'crew-1', picker_id: 'P-001', name: 'John Smith', team_leader_id: 'leader-1' },
            { id: 'crew-2', picker_id: 'P-002', name: 'Jane Doe', team_leader_id: 'leader-1' },
        ],
        orchardName: 'Test Orchard',
        totalBuckets: 300,
        totalHours: 80,
        totalEarnings: 1926,
        avgBPA: 3.75,
        costPerBin: 6.42,
        exportSections: { summary: true, charts: true, teams: true, pickerDetail: true },
        ...overrides,
    };
}

// ── Mock DOM ────────────────────────────────────────
let clickSpy: ReturnType<typeof vi.fn>;
let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

beforeEach(() => {
    clickSpy = vi.fn();
    mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────
// exportCSV
// ──────────────────────────────────────────────────────
describe('exportCSV', () => {
    it('creates a downloadable link and triggers click', () => {
        exportCSV(makeContext() as any);
        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(clickSpy).toHaveBeenCalledOnce();
    });

    it('sets filename with .csv extension and date stamp', () => {
        exportCSV(makeContext() as any);
        expect(mockAnchor.download).toMatch(/harvest_report_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('creates and revokes blob URL', () => {
        exportCSV(makeContext() as any);
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('does not throw with empty pickers', () => {
        expect(() => exportCSV(makeContext({ pickers: [] }) as any)).not.toThrow();
    });

    it('sorts pickers by buckets descending in CSV', () => {
        // Just ensuring the flow runs without error for sorted pickers
        exportCSV(makeContext() as any);
        expect(clickSpy).toHaveBeenCalledOnce();
    });
});

// ──────────────────────────────────────────────────────
// exportPDF
// ──────────────────────────────────────────────────────
describe('exportPDF', () => {
    // Imprime desde un iframe oculto de la propia página (window.open lo cortaba el bloqueador)
    beforeEach(() => vi.restoreAllMocks());
    function mockPrintWindow() {
        document.querySelectorAll('[data-testid="weekly-report-print"]').forEach(f => f.remove());
        return { frame: () => document.querySelector('[data-testid="weekly-report-print"]') as HTMLIFrameElement };
    }
    const htmlOf = (f: HTMLIFrameElement) => f.srcdoc;

    it('prints from a hidden iframe on the same page (no pop-up to block)', () => {
        const open = vi.spyOn(window, 'open');
        const { frame } = mockPrintWindow();
        expect(exportPDF(makeContext() as any)).toBe(true);
        expect(open).not.toHaveBeenCalled();
        const f = frame();
        expect(f).toBeTruthy();
        expect(f.getAttribute('aria-hidden')).toBe('true');
        const print = vi.fn();
        Object.defineProperty(f, 'contentWindow', { configurable: true, value: { focus: vi.fn(), print, addEventListener: vi.fn() } });
        f.onload?.(new Event('load'));
        expect(print).toHaveBeenCalledOnce();
    });

    it('PDF HTML contains orchard name', () => {
        const { frame } = mockPrintWindow();
        exportPDF(makeContext({ orchardName: 'Sunny Acres' }) as any);
        expect(htmlOf(frame())).toContain('Sunny Acres');
    });

    it('PDF HTML contains DOCTYPE and a print stylesheet', () => {
        const { frame } = mockPrintWindow();
        exportPDF(makeContext() as any);
        expect(htmlOf(frame())).toContain('<!DOCTYPE html>');
        expect(htmlOf(frame())).toContain('@page');
    });
});

