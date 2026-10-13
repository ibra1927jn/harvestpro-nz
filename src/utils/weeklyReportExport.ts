/**
 * weeklyReportExport — CSV and PDF export logic for WeeklyReport
 * 
 * Section builders extracted to weeklyReportSections.ts for maintainability.
 * @module utils/weeklyReportExport
 */
import { PickerBreakdown } from '@/services/payroll.service';
import { TrendDataPoint } from '@/components/charts/TrendLineChart';
import { TeamRanking } from '@/hooks/useWeeklyReport';
import {
    getTeamName,
    buildSparkline,
    buildKpiStrip,
    buildInsightStrip,
    buildChartSection,
    buildTeamRows,
    buildTeamSection,
    buildPickerRows,
    buildPickerSection,
    buildDistribution,
    buildCostAnalysis,
    buildDailySummary,
    buildDailySummaryTable,
    buildTeamBreakdown,
} from './weeklyReportSections';
import { todayNZST } from '@/utils/nzst';

interface CrewMember {
    id: string;
    picker_id: string;
    name: string;
    team_leader_id?: string;
}

interface ExportContext {
    pickers: PickerBreakdown[];
    binsTrend: TrendDataPoint[];
    workforceTrend: TrendDataPoint[];
    teamRankings: TeamRanking[];
    crew: CrewMember[];
    orchardName: string;
    totalBuckets: number;
    totalHours: number;
    totalEarnings: number;
    avgBPA: number;
    costPerBin: number;
    exportSections: {
        summary: boolean;
        charts: boolean;
        teams: boolean;
        pickerDetail: boolean;
    };
}

// ═══════════════════════════════════════════
// CSV Export
// ═══════════════════════════════════════════

export function exportCSV(ctx: ExportContext): void {
    const sortedPickers = [...ctx.pickers].sort((a, b) => b.buckets - a.buckets);
    const headers = ['#', 'Sticker ID', 'Name', 'Team Leader', 'Buckets', 'Hours Worked', 'Bins/Hr', 'Piece Rate ($)', 'Top-Up ($)', 'Total Earnings ($)', 'Below Minimum'];
    const rows = sortedPickers.map((p, i) => {
        const teamName = getTeamName(p, ctx.crew);
        const bpa = p.hours_worked > 0 ? p.buckets / p.hours_worked : 0;
        return [
            i + 1, p.picker_id, p.picker_name, teamName,
            p.buckets, p.hours_worked.toFixed(1), bpa.toFixed(1),
            p.piece_rate_earnings.toFixed(2), p.top_up_required.toFixed(2),
            p.total_earnings.toFixed(2), p.is_below_minimum ? 'YES' : 'NO',
        ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    downloadBlob(csv, 'text/csv;charset=utf-8;', `harvest_report_${dateStamp()}.csv`);
}

// ═══════════════════════════════════════════
// PDF Export
// ═══════════════════════════════════════════

export function exportPDF(ctx: ExportContext): void {
    const html = buildPdfHtml(ctx);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
    }
}

// ── Internal helpers ──

function dateStamp(): string {
    return todayNZST();
}

function downloadBlob(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function buildPdfHtml(ctx: ExportContext): string {
    const now = new Date();
    const reportDate = now.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const shortDate = now.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: '2-digit', year: 'numeric' });
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const fmtShort = (d: Date) => d.toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'short', day: 'numeric' });
    const weekNum = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
    const periodLabel = `Week ${weekNum}: ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${now.getFullYear()}`;

    const sortedPickers = [...ctx.pickers].sort((a, b) => b.buckets - a.buckets);
    const totalTopUp = sortedPickers.reduce((s, p) => s + p.top_up_required, 0);
    const totalPieceRate = sortedPickers.reduce((s, p) => s + p.piece_rate_earnings, 0);
    const belowMinCount = sortedPickers.filter(p => p.is_below_minimum).length;
    const bestPicker = sortedPickers[0];
    const aboveAvgCount = sortedPickers.filter(p => (p.hours_worked > 0 ? p.buckets / p.hours_worked : 0) >= ctx.avgBPA).length;
    const totalTons = ctx.totalBuckets * 13.5 / 1000;
    const totalDays = sortedPickers.reduce((s, p) => s + Math.max(1, Math.round(p.hours_worked / 8)), 0);
    const avgDollarPerHr = ctx.totalHours > 0 ? (ctx.totalEarnings / ctx.totalHours).toFixed(2) : '0';
    const avgBinsPerDay = totalDays > 0 ? (ctx.totalBuckets / totalDays).toFixed(1) : '0';

    const binsSvg = ctx.exportSections.charts ? buildSparkline(ctx.binsTrend, '#10b981') : '';
    const workforceSvg = ctx.exportSections.charts ? buildSparkline(ctx.workforceTrend, '#3b82f6') : '';
    const teamRowsHtml = buildTeamRows(ctx.teamRankings, ctx.avgBPA);
    const pickerRows = buildPickerRows(sortedPickers, ctx.crew, ctx.avgBPA);
    const distHtml = buildDistribution(sortedPickers);
    const costAnalysis = buildCostAnalysis(sortedPickers);
    const dailySummaryRows = buildDailySummary(ctx.binsTrend, ctx.workforceTrend, ctx.avgBPA, ctx.costPerBin);
    const teamBreakdownHtml = buildTeamBreakdown(ctx.teamRankings, sortedPickers, ctx.crew, ctx.avgBPA);

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Weekly Report - ${ctx.orchardName}</title>
<style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background: white; font-size: 10px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    table { page-break-inside: auto; border-collapse: collapse; width: 100%; }
    tr { page-break-inside: avoid; }
    .kpi-cell { text-align: center; padding: 8px 6px; border-right: 1px solid #e2e8f0; }
    .kpi-cell:last-child { border-right: none; }
    .kpi-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700; margin-bottom: 2px; }
    .kpi-value { font-size: 18px; font-weight: 900; color: #1e293b; }
    .section-title { font-size: 11px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px; padding: 8px 0 6px; border-bottom: 2px solid #0f172a; margin-bottom: 4px; }
</style></head><body>

<!-- HEADER -->
<div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f4c75 100%); padding: 18px 30px 14px; color: white;">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <div style="width: 28px; height: 28px; background: rgba(255,255,255,0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px;">🍒</div>
                <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.5); font-weight: 700;">Weekly Harvest Report</span>
            </div>
            <h1 style="font-size: 20px; font-weight: 900; margin: 2px 0;">${ctx.orchardName}</h1>
            <p style="font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 600; margin-top: 2px;">📅 ${periodLabel}</p>
        </div>
        <div style="text-align: right;">
            <div style="font-size: 9px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px;">Report ID</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.7); font-family: monospace;">${shortDate}-WR</div>
            <div style="margin-top: 6px; font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.95);">HarvestPro<span style="color: #22d3ee;">NZ</span></div>
            <div style="font-size: 9px; color: rgba(255,255,255,0.4);">${reportDate}</div>
        </div>
    </div>
</div>

${ctx.exportSections.summary ? buildKpiStrip(ctx.totalBuckets, totalTons, ctx.totalHours, ctx.totalEarnings, ctx.costPerBin, ctx.avgBPA, sortedPickers.length, totalTopUp) + buildInsightStrip(bestPicker, totalTopUp, belowMinCount, aboveAvgCount, sortedPickers.length) : ''}

${ctx.exportSections.charts ? buildChartSection(binsSvg, workforceSvg) : ''}

${ctx.exportSections.teams ? buildTeamSection(teamRowsHtml, ctx.teamRankings.length) : ''}

${ctx.exportSections.pickerDetail ? buildPickerSection(pickerRows, sortedPickers.length, belowMinCount, totalTopUp, totalDays, ctx.totalBuckets, avgBinsPerDay, ctx.totalHours, ctx.avgBPA, avgDollarPerHr, totalPieceRate, ctx.totalEarnings) : ''}

<!-- PAGE 2: DAILY SUMMARY -->
<div style="page-break-before: always; margin: 0 30px; padding-top: 16px;">
    <div style="display: flex; gap: 16px;">
        <div style="flex: 1;">
            <div class="section-title">📅 Daily Summary <span style="font-weight: 400; color: #94a3b8; font-size: 9px; margin-left: 4px;">${periodLabel}</span></div>
            ${buildDailySummaryTable(dailySummaryRows)}
        </div>
        <div style="flex: 1;">
            <div class="section-title">📊 Performance Distribution <span style="font-weight: 400; color: #94a3b8; font-size: 9px; margin-left: 4px;">Bins/Hr brackets</span></div>
            <div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; background: white;">
                ${distHtml}
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
                    <span>Avg: ${ctx.avgBPA.toFixed(1)} bins/hr</span>
                    <span>Target: 2.0+ bins/hr</span>
                    <span>${aboveAvgCount}/${sortedPickers.length} above avg</span>
                </div>
            </div>
        </div>
    </div>
    ${costAnalysis}
</div>

${teamBreakdownHtml}

<!-- FOOTER -->
<div style="margin: 8px 30px 0; background: linear-gradient(135deg, #0f172a, #1e3a5f); border-radius: 6px; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center;">
    <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 12px;">🍒</span>
        <span style="font-size: 10px; font-weight: 800; color: white;">HarvestPro<span style="color: #22d3ee;">NZ</span></span>
        <span style="font-size: 8px; color: rgba(255,255,255,0.3);">•</span>
        <span style="font-size: 8px; color: rgba(255,255,255,0.4);">${periodLabel}</span>
    </div>
    <span style="font-size: 8px; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.5px;">Confidential — Internal use only</span>
</div>

</body></html>`;
}
