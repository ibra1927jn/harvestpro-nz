// =============================================
// EXPORT SERVICE - CSV/PDF Generation for Payroll
// =============================================
import type { PickerBreakdown } from '@/services/payroll.service';
import { generateXeroCSV, generatePaySauceCSV } from './export-payroll-formats.service';
import { generatePDFContent } from './export-pdf-template.service';
import { analytics } from '@/config/analytics';

// 🔧 V2: Sanitize CSV cells to prevent formula injection in Excel/Sheets
const escCsv = (val: string): string => {
  const s = String(val);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  // Wrap in quotes if contains comma, quote, or newline
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

// Types
export interface PayrollExportData {
  /** Etiqueta del periodo (para títulos y nombres de fichero) */
  date: string;
  /** Semana de pago exportada (fechas NZ) */
  period?: { start: string; end: string };
  crew: Array<{
    id: string;
    name: string;
    employeeId: string;
    buckets: number;
    hours: number;
    pieceEarnings: number;
    minimumTopUp: number;
    totalEarnings: number;
    status: string;
    /** Días con horas estimadas (turno sin cerrar) */
    estimatedDays?: number;
  }>;
  summary: {
    totalBuckets: number;
    totalHours: number;
    totalPieceEarnings: number;
    totalMinimumTopUp: number;
    grandTotal: number;
    averageBucketsPerHour: number;
    /** Pickers con algún día estimado: revisar hojas de horas antes de pagar */
    pickersWithEstimatedDays?: number;
  };
}

export interface ExportOptions {
  format: 'csv' | 'pdf';
  includeDetails: boolean;
  dateRange?: { start: string; end: string };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nombre de periodo para títulos y ficheros: "2026-10-05_to_2026-10-11" */
function periodLabel(period: { start: string; end: string }): string {
  return period.start === period.end ? period.start : `${period.start}_to_${period.end}`;
}

// =============================================
// EXPORT SERVICE
// =============================================
export const exportService = {
  /**
   * Datos de nómina a exportar, a partir del desglose por picker del cálculo
   * único (calculate-payroll / buildWeekBreakdown): horas con descanso no
   * pagado y complemento al mínimo calculado por día. Aquí no se recalcula nada.
   */
  preparePayrollData(
    pickers: ReadonlyArray<PickerBreakdown>,
    period: { start: string; end: string },
    employeeIdOf: (pickerId: string) => string | undefined = () => undefined
  ): PayrollExportData {
    const crewData = [...pickers]
      .sort((a, b) => a.picker_name.localeCompare(b.picker_name))
      .map(p => {
        const estimatedDays = p.estimated_days ?? 0;
        return {
          id: p.picker_id,
          name: p.picker_name,
          employeeId: employeeIdOf(p.picker_id) || p.picker_id,
          buckets: p.buckets,
          hours: p.hours_worked,
          pieceEarnings: p.piece_rate_earnings,
          minimumTopUp: p.top_up_required,
          totalEarnings: p.total_earnings,
          status: estimatedDays > 0
            ? 'check_timesheet'
            : p.is_below_minimum ? 'topped_up' : 'ok',
          estimatedDays,
        };
      });

    const sum = (k: 'buckets' | 'hours' | 'pieceEarnings' | 'minimumTopUp' | 'totalEarnings') =>
      round2(crewData.reduce((s, p) => s + p[k], 0));
    const totalBuckets = sum('buckets');
    const totalHours = sum('hours');

    return {
      date: periodLabel(period),
      period,
      crew: crewData,
      summary: {
        totalBuckets,
        totalHours,
        totalPieceEarnings: sum('pieceEarnings'),
        totalMinimumTopUp: sum('minimumTopUp'),
        grandTotal: sum('totalEarnings'),
        averageBucketsPerHour: totalHours > 0 ? Math.round((totalBuckets / totalHours) * 10) / 10 : 0,
        pickersWithEstimatedDays: crewData.filter(p => (p.estimatedDays ?? 0) > 0).length,
      },
    };
  },

  /**
   * Generate CSV content from payroll data
   */
  generateCSV(data: PayrollExportData): string {
    const headers = [
      'Employee ID',
      'Name',
      'Buckets',
      'Hours',
      'Piece Earnings (NZD)',
      'Minimum Top-Up (NZD)',
      'Total Earnings (NZD)',
      'Status',
      'Estimated Days',
    ];

    // 🔧 V2: All string cells sanitized against CSV injection
    const rows = data.crew.map(p => [
      escCsv(p.employeeId),
      escCsv(p.name),
      p.buckets.toString(),
      p.hours.toFixed(1),
      p.pieceEarnings.toFixed(2),
      p.minimumTopUp.toFixed(2),
      p.totalEarnings.toFixed(2),
      escCsv(p.status),
      String(p.estimatedDays ?? 0),
    ]);

    // Add summary rows
    rows.push([]);
    rows.push(['SUMMARY']);
    rows.push(['Total Buckets', '', data.summary.totalBuckets.toString()]);
    rows.push(['Total Hours', '', '', data.summary.totalHours.toFixed(1)]);
    rows.push(['Total Piece Earnings', '', '', '', data.summary.totalPieceEarnings.toFixed(2)]);
    rows.push(['Total Minimum Top-Up', '', '', '', '', data.summary.totalMinimumTopUp.toFixed(2)]);
    rows.push(['Grand Total', '', '', '', '', '', data.summary.grandTotal.toFixed(2)]);
    rows.push(['Avg Buckets/Hour', data.summary.averageBucketsPerHour.toString()]);

    const title = data.period
      ? `Payroll Report - week ${data.period.start} to ${data.period.end}`
      : `Payroll Report - ${data.date}`;
    const csvContent = [
      title,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    return csvContent;
  },

  /** Generate PDF-ready HTML content (delegated to export-pdf-template.service) */
  generatePDFContent,

  /**
   * Download file to user's device
   */
  downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Genera y descarga la exportación en el formato pedido.
   * Devuelve nombre de fichero y totales para el historial.
   */
  exportPayroll(
    format: ExportFormat,
    data: PayrollExportData
  ): { filename: string; recordCount: number; totalEarnings: number } {
    let filename: string;
    switch (format) {
      case 'csv':
        filename = `payroll-${data.date}.csv`;
        this.downloadFile(this.generateCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'xero':
        filename = `xero-payroll-${data.date}.csv`;
        this.downloadFile(generateXeroCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'paysauce':
        filename = `paysauce-payroll-${data.date}.csv`;
        this.downloadFile(generatePaySauceCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'pdf':
        // Fichero HTML listo para imprimir o "Guardar como PDF" (funciona sin conexión)
        filename = `payroll-report-${data.date}.html`;
        this.downloadFile(this.generatePDFContent(data), filename, 'text/html;charset=utf-8');
        break;
    }
    analytics.trackPayrollExport(format, data.crew.length);
    return { filename, recordCount: data.crew.length, totalEarnings: data.summary.grandTotal };
  },

  // =============================================
  // PAYROLL FORMAT ADAPTERS (delegated)
  // =============================================
  generateXeroCSV: generateXeroCSV,
  generatePaySauceCSV: generatePaySauceCSV,
};

/** Available export format types */
export type ExportFormat = 'csv' | 'xero' | 'paysauce' | 'pdf';

export default exportService;
