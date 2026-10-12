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
    /** Cubetas de la semana por variedad y precio (líneas de Xero/PaySauce) */
    pieceLines?: Array<{ variety: string; rate: number; buckets: number; earnings: number }>;
    /** Detalle día a día */
    days?: Array<{
      date: string;
      orchards: string;
      times: string;
      breakMinutes: number;
      travelMinutes: number;
      hours: number;
      buckets: string;
      pieceEarnings: number;
      topUp: number;
      total: number;
      estimated: boolean;
    }>;
  }>;
  /** Coste de la semana por huerto (horas, cubetas, pago) */
  byOrchard?: Array<{ orchard: string; hours: number; buckets: number; pieceEarnings: number; topUp: number; total: number }>;
  /** final = semana cerrada (lo que se paga); draft = puede cambiar todavía */
  status?: 'final' | 'draft';
  closedAt?: string | null;
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

/** FINAL (semana cerrada) o DRAFT (puede cambiar) */
export function statusLine(data: Pick<PayrollExportData, 'status' | 'closedAt'>): string {
  return data.status === 'final'
    ? `FINAL - pay week closed ${data.closedAt ?? ''}`.trim()
    : 'DRAFT - pay week not closed yet; figures may still change';
}

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
    employeeIdOf: (pickerId: string) => string | undefined = () => undefined,
    opts: { closedAt?: string | null; orchardName?: (orchardId: string | null) => string } = {}
  ): PayrollExportData {
    const orchardName = opts.orchardName ?? ((id: string | null) => id ?? '—');
    const time = (iso: string | null) => iso
      ? new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
      : '—';
    const orchardTotals = new Map<string, { orchard: string; hours: number; buckets: number; pieceEarnings: number; topUp: number; total: number }>();
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
          pieceLines: (() => {
            const lines = new Map<string, { variety: string; rate: number; buckets: number; earnings: number }>();
            for (const d of p.days ?? []) for (const l of d.pieceLines ?? []) {
              const k = `${l.variety}|${l.rate}`;
              const e = lines.get(k) ?? { variety: l.variety, rate: l.rate, buckets: 0, earnings: 0 };
              e.buckets += l.buckets;
              e.earnings = round2(e.earnings + l.earnings);
              lines.set(k, e);
            }
            return [...lines.values()];
          })(),
          days: (p.days ?? []).map(d => {
            for (const o of d.byOrchard ?? []) {
              const name = orchardName(o.orchardId);
              const t = orchardTotals.get(name) ?? { orchard: name, hours: 0, buckets: 0, pieceEarnings: 0, topUp: 0, total: 0 };
              t.hours = round2(t.hours + o.hours);
              t.buckets += o.buckets;
              t.pieceEarnings = round2(t.pieceEarnings + o.pieceEarnings);
              t.topUp = round2(t.topUp + o.topUp);
              t.total = round2(t.total + o.total);
              orchardTotals.set(name, t);
            }
            return {
              date: d.date,
              orchards: [...new Set(d.segments.map(s => orchardName(s.orchardId)))].join(' + ') || '—',
              times: d.segments.map(s => `${time(s.checkIn)}-${s.open ? 'open' : time(s.checkOut)}`).join(' / ') || 'no check-in',
              breakMinutes: d.breakMinutes,
              travelMinutes: d.travelMinutes ?? 0,
              hours: d.hours,
              buckets: Object.entries(d.bucketsByVariety).map(([v, n]) => `${n} ${v === '—' ? '(no variety)' : v}`).join(' · ') || '0',
              pieceEarnings: d.pieceEarnings,
              topUp: d.topUp,
              total: d.total,
              estimated: d.estimated,
            };
          }),
        };
      });

    const sum = (k: 'buckets' | 'hours' | 'pieceEarnings' | 'minimumTopUp' | 'totalEarnings') =>
      round2(crewData.reduce((s, p) => s + p[k], 0));
    const totalBuckets = sum('buckets');
    const totalHours = sum('hours');

    return {
      date: periodLabel(period),
      period,
      status: opts.closedAt ? 'final' : 'draft',
      closedAt: opts.closedAt ?? null,
      byOrchard: [...orchardTotals.values()].sort((a, b) => a.orchard.localeCompare(b.orchard)),
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

    // Detalle por día: huertos, horas de entrada/salida, descanso, trayecto, variedades
    const detail: string[][] = [[], ['DAILY DETAIL'], [
      'Employee ID', 'Name', 'Date', 'Orchards', 'In-Out', 'Break (min, unpaid)', 'Travel (min, paid)',
      'Paid Hours', 'Buckets', 'Piece Earnings (NZD)', 'Top-Up (NZD)', 'Total (NZD)', 'Estimated',
    ]];
    for (const p of data.crew) for (const d of p.days ?? []) {
      detail.push([
        escCsv(p.employeeId), escCsv(p.name), d.date, escCsv(d.orchards), escCsv(d.times),
        String(d.breakMinutes), String(d.travelMinutes), d.hours.toFixed(2), escCsv(d.buckets),
        d.pieceEarnings.toFixed(2), d.topUp.toFixed(2), d.total.toFixed(2), d.estimated ? 'yes' : 'no',
      ]);
    }
    // Coste por huerto (trayecto: mitad a cada huerto; complemento según horas)
    const orchards: string[][] = [[], ['COST BY ORCHARD'], ['Orchard', 'Paid Hours', 'Buckets', 'Piece Earnings (NZD)', 'Top-Up (NZD)', 'Total (NZD)']];
    for (const o of data.byOrchard ?? []) {
      orchards.push([escCsv(o.orchard), o.hours.toFixed(2), String(o.buckets), o.pieceEarnings.toFixed(2), o.topUp.toFixed(2), o.total.toFixed(2)]);
    }

    const title = data.period
      ? `Payroll Report - week ${data.period.start} to ${data.period.end}`
      : `Payroll Report - ${data.date}`;
    const csvContent = [
      title,
      statusLine(data),
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
      ...(data.crew.some(p => p.days?.length) ? detail.map(row => row.join(',')) : []),
      ...((data.byOrchard?.length ?? 0) > 0 ? orchards.map(row => row.join(',')) : []),
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
    // Un borrador lo dice en el nombre del fichero, para no pagarlo por error
    const tag = data.status === 'final' ? '' : '-DRAFT';
    switch (format) {
      case 'csv':
        filename = `payroll-${data.date}${tag}.csv`;
        this.downloadFile(this.generateCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'xero':
        filename = `xero-payroll-${data.date}${tag}.csv`;
        this.downloadFile(generateXeroCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'paysauce':
        filename = `paysauce-payroll-${data.date}${tag}.csv`;
        this.downloadFile(generatePaySauceCSV(data), filename, 'text/csv;charset=utf-8');
        break;
      case 'pdf':
        // Fichero HTML listo para imprimir o "Guardar como PDF" (funciona sin conexión)
        filename = `payroll-report-${data.date}${tag}.html`;
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
