import { http, HttpResponse } from 'msw';
import { MOCK_IDS, mockDatabase, mockPickersPerformanceToday } from '../data';

export const functionsHandlers = [
  // Provisiona un nuevo orchard (onboarding)
  http.post('*/functions/v1/provision-orchard', () => {
    return HttpResponse.json({
      success: true,
      orchardId: MOCK_IDS.ORCHARD,
      orchardName: 'Sunrise Apple Orchard',
      userId: MOCK_IDS.USER_MANAGER,
    });
  }),

  // Cálculo de nómina — formato exacto que espera PayrollResultSchema (Zod)
  http.post('*/functions/v1/calculate-payroll', () => {
    const pickers = mockPickersPerformanceToday as Array<Record<string, unknown>>;
    const settings = (mockDatabase['harvest_settings'] as Array<Record<string, unknown>>)?.[0] ?? {};
    const PIECE_RATE = (settings.piece_rate as number) ?? 6.50;
    const MIN_WAGE   = (settings.min_wage_rate as number) ?? 23.95;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());

    const picker_breakdown = pickers.map(p => {
      const buckets        = (p.total_buckets_today as number) ?? 0;
      const hours_worked   = (p.hours_worked as number) ?? 6.5;
      const piece_rate_earnings = parseFloat((buckets * PIECE_RATE).toFixed(2));
      const minimum_required    = parseFloat((hours_worked * MIN_WAGE).toFixed(2));
      const top_up_required     = parseFloat(Math.max(0, minimum_required - piece_rate_earnings).toFixed(2));
      const total_earnings      = parseFloat((piece_rate_earnings + top_up_required).toFixed(2));
      const hourly_rate         = hours_worked > 0 ? parseFloat((total_earnings / hours_worked).toFixed(2)) : 0;
      return {
        picker_id:           p.id as string,
        picker_name:         p.name as string,
        buckets,
        hours_worked,
        piece_rate_earnings,
        hourly_rate,
        minimum_required,
        top_up_required,
        total_earnings,
        is_below_minimum:    piece_rate_earnings < minimum_required,
      };
    });

    const totalBuckets    = picker_breakdown.reduce((s, p) => s + p.buckets, 0);
    const totalHours      = parseFloat(picker_breakdown.reduce((s, p) => s + p.hours_worked, 0).toFixed(1));
    const totalPieceRate  = parseFloat(picker_breakdown.reduce((s, p) => s + p.piece_rate_earnings, 0).toFixed(2));
    const totalTopUp      = parseFloat(picker_breakdown.reduce((s, p) => s + p.top_up_required, 0).toFixed(2));
    const totalEarnings   = parseFloat(picker_breakdown.reduce((s, p) => s + p.total_earnings, 0).toFixed(2));
    const belowMin        = picker_breakdown.filter(p => p.is_below_minimum).length;
    const complianceRate  = picker_breakdown.length > 0
      ? parseFloat(((picker_breakdown.length - belowMin) / picker_breakdown.length * 100).toFixed(2))
      : 100;

    return HttpResponse.json({
      orchard_id:  MOCK_IDS.ORCHARD,
      date_range:  { start: '2026-04-05', end: today },
      summary: {
        total_buckets:             totalBuckets,
        total_hours:               totalHours,
        total_piece_rate_earnings: totalPieceRate,
        total_top_up:              totalTopUp,
        total_earnings:            totalEarnings,
      },
      compliance: {
        workers_below_minimum: belowMin,
        workers_total:         picker_breakdown.length,
        compliance_rate:       complianceRate,
      },
      picker_breakdown,
      settings: {
        bucket_rate:    PIECE_RATE,
        min_wage_rate:  MIN_WAGE,
      },
    });
  }),

  // Asistencia: check-in / check-out
  http.post('*/functions/v1/manage-attendance', () => {
    return HttpResponse.json({ success: true });
  }),

  // Administración de usuarios
  http.post('*/functions/v1/manage-admin', () => {
    return HttpResponse.json({ success: true });
  }),

  // Audit log
  http.post('*/functions/v1/submit-audit-log', () => {
    return HttpResponse.json({ success: true });
  }),

  // Registro de balde (operación core)
  http.post('*/functions/v1/record-bucket', () => {
    return HttpResponse.json({
      success: true,
      bucketId: crypto.randomUUID(),
      pickerId: MOCK_IDS.USER_TL,
      rowNumber: 5,
    });
  }),

  // Push notifications
  http.post('*/functions/v1/send-push', () => {
    return HttpResponse.json({ success: true });
  }),

  // Verificación de cumplimiento NZ — calcula violaciones reales desde mock data
  http.post('*/functions/v1/check-compliance', () => {
    const pickers = mockPickersPerformanceToday as Array<Record<string, unknown>>;
    const settings = (mockDatabase['harvest_settings'] as Array<Record<string, unknown>>)?.[0] ?? {};
    const PIECE_RATE = (settings.piece_rate as number) ?? 6.50;
    const MIN_WAGE   = (settings.min_wage_rate as number) ?? 23.95;

    const violations = pickers
      .filter(p => {
        const hours = (p.hours_worked as number) ?? 0;
        if (!hours) return false;  // sin hours tracked — no evaluado
        const buckets = (p.total_buckets_today as number) ?? 0;
        const pieceEarnings = buckets * PIECE_RATE;
        const minWageEarnings = hours * MIN_WAGE;
        return pieceEarnings < minWageEarnings;
      })
      .map(p => {
        const hours = (p.hours_worked as number) ?? 0;
        const buckets = (p.total_buckets_today as number) ?? 0;
        const pieceEarnings = parseFloat((buckets * PIECE_RATE).toFixed(2));
        const minWageEarnings = parseFloat((hours * MIN_WAGE).toFixed(2));
        return {
          picker_id: p.id,
          picker_name: p.name,
          buckets_today: buckets,
          hours_worked: hours,
          piece_earnings: pieceEarnings,
          min_wage_earnings: minWageEarnings,
          shortfall: parseFloat((minWageEarnings - pieceEarnings).toFixed(2)),
        };
      });

    return HttpResponse.json({
      success: true,
      compliant: violations.length === 0,
      violation_count: violations.length,
      total_shortfall: parseFloat(violations.reduce((s, v) => s + v.shortfall, 0).toFixed(2)),
      violations,
    });
  }),

  // Detección de anomalías
  http.post('*/functions/v1/detect-anomalies', () => {
    return HttpResponse.json({
      success: true,
      anomalies: [],
    });
  }),

  // Aprobación de timesheet
  http.post('*/functions/v1/approve-timesheet', () => {
    return HttpResponse.json({ success: true });
  }),

  // API pública v1
  http.all('*/functions/v1/api-v1/*', () => {
    return HttpResponse.json({ success: true, data: [] });
  }),

  // Warmup de Edge Functions (fuego y olvida)
  http.post('*/functions/v1/*', () => {
    return HttpResponse.json({ success: true });
  }),
];
