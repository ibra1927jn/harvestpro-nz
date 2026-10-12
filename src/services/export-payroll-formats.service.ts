/**
 * export-payroll-formats.service.ts
 * NZ Payroll format adapters: Xero & PaySauce CSV generation
 */
import type { PayrollExportData } from './export.service';

// CSV cell sanitizer (protect against formula injection)
const escCsv = (val: string): string => {
    const s = String(val);
    if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

// =============================================
// XERO PAYROLL FORMAT
// =============================================

/**
 * Generate CSV in Xero Payroll import format.
 * Xero expects: Employee ID, Employee Name, Earnings Rate Name, Hours/Quantity, Rate, Amount
 */
export function generateXeroCSV(data: PayrollExportData): string {
    const headers = [
        'Employee ID', 'Employee Name', 'Earnings Rate Name',
        'Hours/Quantity', 'Rate', 'Amount',
    ];

    const rows: string[][] = [];

    // Cobra lo mayor entre cubetas y mínimo: líneas de cubetas (una por variedad
    // y precio) + complemento al mínimo si lo hay. Nunca las dos cosas enteras.
    data.crew.forEach(p => {
        const lines = p.pieceLines?.length
            ? p.pieceLines
            : p.buckets > 0 ? [{ variety: '', rate: p.pieceEarnings / p.buckets, buckets: p.buckets, earnings: p.pieceEarnings }] : [];
        for (const l of lines) {
            if (l.buckets <= 0) continue;
            rows.push([
                escCsv(p.employeeId), escCsv(p.name),
                escCsv(l.variety && l.variety !== '—' ? `Piece Rate - ${l.variety}` : 'Piece Rate Earnings'),
                l.buckets.toString(),
                l.rate.toFixed(2),
                l.earnings.toFixed(2),
            ]);
        }
        // Festivo trabajado: la media parte extra de lo ganado por cubetas
        if ((p.holidayPremium ?? 0) > 0) {
            rows.push([
                escCsv(p.employeeId), escCsv(p.name), 'Public Holiday Premium',
                '1', (p.holidayPremium ?? 0).toFixed(2), (p.holidayPremium ?? 0).toFixed(2),
            ]);
        }
        if (p.minimumTopUp > 0) {
            rows.push([
                escCsv(p.employeeId), escCsv(p.name), 'Minimum Wage Top-Up',
                p.hours.toFixed(2),
                (p.minimumTopUp / Math.max(p.hours, 0.01)).toFixed(2),
                p.minimumTopUp.toFixed(2),
            ]);
        }
    });

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// =============================================
// PAYSAUCE FORMAT
// =============================================

/**
 * Generate CSV in PaySauce import format.
 * PaySauce expects: Employee Number, Pay Type, Description, Quantity, Rate, Amount
 */
export function generatePaySauceCSV(data: PayrollExportData): string {
    const headers = [
        'Employee Number', 'Pay Type', 'Description', 'Quantity', 'Rate', 'Amount',
    ];

    const rows: string[][] = [];

    data.crew.forEach(p => {
        if (p.hours <= 0 && p.totalEarnings <= 0 && p.buckets <= 0) return;
        const lines = p.pieceLines?.length
            ? p.pieceLines
            : p.buckets > 0 ? [{ variety: '', rate: p.pieceEarnings / p.buckets, buckets: p.buckets, earnings: p.pieceEarnings }] : [];
        for (const l of lines) {
            if (l.buckets <= 0) continue;
            rows.push([
                escCsv(p.employeeId), 'PIECE',
                escCsv(`Harvest ${l.variety && l.variety !== '—' ? l.variety + ' ' : ''}buckets (${p.hours.toFixed(2)}h worked)`),
                l.buckets.toString(), l.rate.toFixed(2), l.earnings.toFixed(2),
            ]);
        }
        if ((p.holidayPremium ?? 0) > 0) {
            rows.push([
                escCsv(p.employeeId), 'PUBLIC_HOLIDAY',
                escCsv('Public holiday premium (time and a half on piece earnings)'),
                '1', (p.holidayPremium ?? 0).toFixed(2), (p.holidayPremium ?? 0).toFixed(2),
            ]);
        }
        if (p.minimumTopUp > 0 || lines.length === 0) {
            rows.push([
                escCsv(p.employeeId), 'MIN_WAGE_TOPUP',
                escCsv(`Minimum wage top-up (${p.hours.toFixed(2)}h)`),
                p.hours.toFixed(2),
                (p.minimumTopUp / Math.max(p.hours, 0.01)).toFixed(2),
                p.minimumTopUp.toFixed(2),
            ]);
        }
    });

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
