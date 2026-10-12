// =============================================
// EXPORT PDF TEMPLATE — HTML generation for payroll reports
// Extracted from export.service.ts for maintainability
// =============================================
import { MINIMUM_WAGE, PIECE_RATE } from '../types';
import { statusLine, type PayrollExportData } from './export.service';

/** Escape HTML entities to prevent XSS in PDF export */
export const escHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Generate PDF-ready HTML content from payroll data
 */
export function generatePDFContent(data: PayrollExportData, options?: { pieceRate?: number; minWage?: number }): string {
    const displayPieceRate = options?.pieceRate ?? PIECE_RATE;
    const displayMinWage = options?.minWage ?? MINIMUM_WAGE;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Payroll Report - ${data.date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a2e; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #d91e36; padding-bottom: 20px; }
    .header h1 { color: #d91e36; font-size: 28px; margin-bottom: 5px; }
    .header p { color: #666; font-size: 14px; }
    .logo { font-size: 32px; font-weight: bold; color: #d91e36; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #d91e36; color: white; padding: 12px 8px; text-align: left; font-size: 12px; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) { background: #f9f9f9; }
    .summary { margin-top: 30px; background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .summary h3 { color: #d91e36; margin-bottom: 15px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
    .summary-item { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #d91e36; }
    .summary-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .summary-value { font-size: 20px; font-weight: bold; color: #1a1a2e; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; }
    .currency { text-align: right; }
    .status { font-weight: bold; font-size: 13px; margin: 8px 0; padding: 6px 10px; border-radius: 6px; display: inline-block; }
    .status.final { background: #e8f7ee; color: #1b7a3d; }
    .status.draft { background: #fff4e0; color: #9a5b00; }
    h3.section { color: #d91e36; margin-top: 30px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🍒 HarvestPro NZ</div>
    <h1>Weekly Payroll Report</h1>
    <p class="status ${data.status === 'final' ? 'final' : 'draft'}">${escHtml(statusLine(data))}</p>
    <p>Week: ${data.period ? `${data.period.start} → ${data.period.end}` : data.date} | Generated: ${new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Employee ID</th>
        <th>Name</th>
        <th>Buckets</th>
        <th>Hours</th>
        <th class="currency">Piece ($)</th>
        <th class="currency">Top-Up ($)</th>
        <th class="currency">Total ($)</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${data.crew.map(p => `
        <tr>
          <td>${escHtml(p.employeeId)}</td>
          <td>${escHtml(p.name)}</td>
          <td>${p.buckets}</td>
          <td>${p.hours.toFixed(1)}</td>
          <td class="currency">$${p.pieceEarnings.toFixed(2)}</td>
          <td class="currency">$${p.minimumTopUp.toFixed(2)}</td>
          <td class="currency"><strong>$${p.totalEarnings.toFixed(2)}</strong></td>
          <td>${escHtml(p.status)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="summary">
    <h3>Summary</h3>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Total Buckets</div>
        <div class="summary-value">${data.summary.totalBuckets}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Hours</div>
        <div class="summary-value">${data.summary.totalHours.toFixed(1)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Avg Buckets/Hour</div>
        <div class="summary-value">${data.summary.averageBucketsPerHour}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Piece Earnings</div>
        <div class="summary-value">$${data.summary.totalPieceEarnings.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Minimum Top-Up</div>
        <div class="summary-value">$${data.summary.totalMinimumTopUp.toFixed(2)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Grand Total</div>
        <div class="summary-value" style="color: #d91e36;">$${data.summary.grandTotal.toFixed(2)}</div>
      </div>
    </div>
  </div>

  ${(data.byOrchard?.length ?? 0) > 0 ? `
  <h3 class="section">Cost by orchard</h3>
  <p style="font-size:11px;color:#666">Travel between orchards is paid, half to each orchard. Top-up is shared by hours.</p>
  <table>
    <thead><tr><th>Orchard</th><th>Paid hours</th><th>Buckets</th><th class="currency">Piece ($)</th><th class="currency">Top-Up ($)</th><th class="currency">Total ($)</th></tr></thead>
    <tbody>
      ${(data.byOrchard ?? []).map(o => `
        <tr>
          <td>${escHtml(o.orchard)}</td>
          <td>${o.hours.toFixed(2)}</td>
          <td>${o.buckets}</td>
          <td class="currency">$${o.pieceEarnings.toFixed(2)}</td>
          <td class="currency">$${o.topUp.toFixed(2)}</td>
          <td class="currency"><strong>$${o.total.toFixed(2)}</strong></td>
        </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="footer">
    <p>HarvestPro NZ - Payroll Management System</p>
    <p>Minimum Wage: $${displayMinWage}/hr | Default piece rate: $${displayPieceRate}/bucket (each variety is paid at its own price)</p>
  </div>
</body>
</html>`;

    return html;
}
