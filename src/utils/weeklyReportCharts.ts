/**
 * weeklyReportCharts — SVG chart builders and visualization helpers for PDF export
 * Extracted from weeklyReportSections.ts to reduce file size.
 * 
 * Functions: buildSparkline, buildChartSection, buildDistribution,
 *            buildCostAnalysis, buildDailySummary, buildDailySummaryTable
 * @module utils/weeklyReportCharts
 */
import { PickerBreakdown } from '@/services/payroll.service';
import { TrendDataPoint } from '@/components/charts/TrendLineChart';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

// ── SVG Sparkline builder ──
export function buildSparkline(data: TrendDataPoint[], color: string): string {
    if (data.length < 2) return '';
    const vals = data.map(d => d.value);
    const max = Math.max(...vals) * 1.1 || 1;
    const min = Math.min(...vals) * 0.9;
    const range = max - min || 1;
    const w = 380, h = 55, px = 12, py = 6;
    const points = vals.map((v, i) => {
        const x = px + (i / (vals.length - 1)) * (w - 2 * px);
        const y = py + (1 - (v - min) / range) * (h - 2 * py);
        return `${x},${y}`;
    });
    const fp = `${px},${h - py} ${points.join(' ')} ${w - px},${h - py}`;
    const labels = data.map((d, i) => {
        const x = px + (i / (vals.length - 1)) * (w - 2 * px);
        return `<text x="${x}" y="${h + 10}" fill="#94a3b8" font-size="8" text-anchor="middle" font-family="system-ui">${d.label}</text>`;
    }).join('');
    const dots = vals.map((v, i) => {
        const x = px + (i / (vals.length - 1)) * (w - 2 * px);
        const y = py + (1 - (v - min) / range) * (h - 2 * py);
        return `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}" stroke="white" stroke-width="1"/>
                <text x="${x}" y="${y - 6}" fill="${color}" font-size="7" text-anchor="middle" font-weight="700" font-family="system-ui">${v}</text>`;
    }).join('');
    return `<svg width="${w}" height="${h + 14}" viewBox="0 0 ${w} ${h + 14}" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${fp}" fill="${color}" opacity="0.15"/>
        <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}${labels}
    </svg>`;
}

// ── Chart section (bins + workforce side by side) ──
export function buildChartSection(binsSvg: string, workforceSvg: string): string {
    return `<div style="margin: 10px 30px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: white;">
        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
            <span style="font-size: 11px;">📈</span>
            <span style="font-size: 10px; font-weight: 800; color: #065f46;">Harvest Velocity</span>
            <span style="font-size: 8px; color: #94a3b8; margin-left: auto;">bins/day</span>
        </div>
        ${binsSvg}
    </div>
    <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: white;">
        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
            <span style="font-size: 11px;">👥</span>
            <span style="font-size: 10px; font-weight: 800; color: #1e40af;">Workforce Size</span>
            <span style="font-size: 8px; color: #94a3b8; margin-left: auto;">pickers/day</span>
        </div>
        ${workforceSvg}
    </div>
</div>`;
}

// ── Performance distribution histogram ──
export function buildDistribution(sortedPickers: PickerBreakdown[]): string {
    const brackets = [
        { label: '3.0+ (Excellent)', min: 3.0, max: Infinity, color: '#059669', count: 0 },
        { label: '2.0–3.0 (Good)', min: 2.0, max: 3.0, color: '#0284c7', count: 0 },
        { label: '1.0–2.0 (Below Target)', min: 1.0, max: 2.0, color: '#f59e0b', count: 0 },
        { label: '<1.0 (Needs Action)', min: 0, max: 1.0, color: '#ef4444', count: 0 },
    ];
    sortedPickers.forEach(p => {
        const bpa = p.hours_worked > 0 ? p.buckets / p.hours_worked : 0;
        const b = brackets.find(br => bpa >= br.min && bpa < br.max);
        if (b) b.count++;
    });
    const maxBracket = Math.max(...brackets.map(b => b.count), 1);
    return brackets.map(b => {
        const pct = (b.count / maxBracket) * 100;
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
            <span style="width:150px;font-size:10px;font-weight:600;color:#475569;text-align:right;">${b.label}</span>
            <div style="flex:1;background:#f1f5f9;border-radius:4px;height:16px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${b.color};border-radius:4px;min-width:${b.count > 0 ? '2px' : '0'};"></div>
            </div>
            <span style="width:40px;font-size:11px;font-weight:800;color:#1e293b;">${b.count}</span>
        </div>`;
    }).join('');
}

// ── Cost analysis (top 5 efficient vs. top 5 costly) ──
export function buildCostAnalysis(sortedPickers: PickerBreakdown[]): string {
    const pickersWithCost = sortedPickers.filter(p => p.buckets > 0).map(p => ({
        ...p, costPerBin: p.total_earnings / p.buckets,
        effRate: p.hours_worked > 0 ? p.total_earnings / p.hours_worked : 0
    }));
    const top5Eff = [...pickersWithCost].sort((a, b) => a.costPerBin - b.costPerBin).slice(0, 5);
    const bottom5Eff = [...pickersWithCost].sort((a, b) => b.costPerBin - a.costPerBin).slice(0, 5);
    const costRow = (list: typeof top5Eff, isBottom: boolean) => list.map((p, i) => `<tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
        <td style="padding:4px 8px;font-size:10px;color:#94a3b8;font-weight:700;">${i + 1}</td>
        <td style="padding:4px 8px;font-size:10px;font-weight:600;color:#1e293b;">${p.picker_name}</td>
        <td style="padding:4px 8px;text-align:right;font-size:10px;font-weight:800;color:#0284c7;">${p.buckets}</td>
        <td style="padding:4px 8px;text-align:right;font-size:10px;color:#475569;">$${p.total_earnings.toFixed(2)}</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;font-weight:800;color:${isBottom ? '#dc2626' : '#059669'};">$${p.costPerBin.toFixed(2)}</td>
        <td style="padding:4px 8px;text-align:right;font-size:10px;color:${p.effRate < PAY_RULES.minWageFloor ? '#dc2626' : '#059669'};font-weight:700;">$${p.effRate.toFixed(2)}/hr</td>
    </tr>`).join('');
    const thStyle = 'padding: 4px 8px; font-size: 8px; text-transform: uppercase; color: #94a3b8;';
    const headers = `<th style="${thStyle}">#</th><th style="${thStyle} text-align: left;">Name</th><th style="${thStyle} text-align: right;">Bins</th><th style="${thStyle} text-align: right;">Earned</th><th style="${thStyle} text-align: right;">$/Bin</th><th style="${thStyle} text-align: right;">$/Hr</th>`;
    return `<div style="margin-top: 12px; display: flex; gap: 16px;">
    <div style="flex: 1;">
        <div class="section-title" style="color: #059669;">✅ Top 5 Most Efficient <span style="font-weight: 400; color: #94a3b8; font-size: 9px; margin-left: 4px;">Lowest $/bin</span></div>
        <table style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;"><thead><tr style="background: #f0fdf4; border-bottom: 1px solid #e2e8f0;">${headers}</tr></thead><tbody>${costRow(top5Eff, false)}</tbody></table>
    </div>
    <div style="flex: 1;">
        <div class="section-title" style="color: #dc2626;">⚠ Top 5 Most Costly <span style="font-weight: 400; color: #94a3b8; font-size: 9px; margin-left: 4px;">Highest $/bin</span></div>
        <table style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;"><thead><tr style="background: #fef2f2; border-bottom: 1px solid #e2e8f0;">${headers}</tr></thead><tbody>${costRow(bottom5Eff, true)}</tbody></table>
    </div>
</div>`;
}

// ── Daily summary rows (bins, pickers, cost per day) ──
export function buildDailySummary(binsTrend: TrendDataPoint[], workforceTrend: TrendDataPoint[], avgBPA: number, costPerBin: number): string {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return binsTrend.map((d, i) => {
        const wf = workforceTrend[i];
        const pickers = wf?.value || 0;
        const bins = d.value || 0;
        const estHours = pickers * 8;
        const estAvgBpa = estHours > 0 ? bins / estHours : 0;
        const estCost = bins * costPerBin;
        const estCpb = bins > 0 ? estCost / bins : 0;
        return `<tr style="border-bottom:1px solid #f1f5f9;background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
            <td style="padding:5px 10px;font-weight:700;font-size:11px;color:#1e293b;">${d.label || dayNames[i] || 'Day ' + (i + 1)}</td>
            <td style="padding:5px 10px;text-align:center;font-size:10px;font-weight:700;color:#4338ca;">${pickers}</td>
            <td style="padding:5px 10px;text-align:right;font-size:11px;font-weight:800;color:#0284c7;">${bins}</td>
            <td style="padding:5px 10px;text-align:right;font-size:10px;color:#64748b;">${estHours.toFixed(0)}h</td>
            <td style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;color:${estAvgBpa >= avgBPA ? '#059669' : '#dc2626'};">${estAvgBpa.toFixed(1)}</td>
            <td style="padding:5px 10px;text-align:right;font-size:10px;color:#475569;">$${estCost.toFixed(0)}</td>
            <td style="padding:5px 10px;text-align:right;font-size:10px;color:#be123c;font-weight:700;">$${estCpb.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

// ── Daily summary table wrapper ──
export function buildDailySummaryTable(rows: string): string {
    const thStyle = 'padding: 5px 10px; font-size: 8px; text-transform: uppercase; color: #94a3b8;';
    return `<table style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
    <thead><tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
        <th style="${thStyle} text-align: left;">Day</th>
        <th style="${thStyle} text-align: center;">Pickers</th>
        <th style="${thStyle} text-align: right;">Bins</th>
        <th style="${thStyle} text-align: right;">Hours</th>
        <th style="${thStyle} text-align: right;">Avg B/Hr</th>
        <th style="${thStyle} text-align: right;">Est. Cost</th>
        <th style="${thStyle} text-align: right;">Cost/Bin</th>
    </tr></thead>
    <tbody>${rows}</tbody>
</table>`;
}
