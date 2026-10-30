/**
 * Picker History Service
 *
 * Fetches historical data for a picker: attendance, bucket records, quality,
 * and computes risk badges (fatigue, chronic top-up, quality drop).
 */
import { pickerHistoryRepository } from '@/repositories/picker-history.repository';
import { logger } from '@/utils/logger';
import { nzMidnight } from '@/utils/nzst';
import { attendanceRowOf, payForRange, pieceRateOn, nzDateOf, PAY_RULES } from '@/services/harvestMetrics/pay';
import { loadOrchardNames } from '@/repositories/pay-rates.repository';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { countCriteriaFailures, type CriterionFailureCount } from '@/services/qcCriteria';

// --- Types ---
export interface PickerProfile {
  id: string;
  picker_id: string;
  name: string;
  team_leader_id: string | null;
  team_leader_name: string | null;
  status: string;
  created_at: string;
}

export interface DailyRecord {
  date: string;
  buckets: number;
  /** Horas pagables (descanso de 30 min no pagado ya descontado) */
  hours: number;
  /**
   * Pago total del día: cubetas + complemento al mínimo. null = no se puede
   * calcular: ese día cogió cubetas en otro huerto y esta cuenta no lee su
   * precio (cada uno solo ve los de su huerto, migración 20261027050000)
   */
  earnings: number | null;
  /** Complemento al mínimo del día */
  topUp?: number;
  /**
   * Ese día trabajó también en otro huerto cuyos fichajes y cubetas esta cuenta
   * no lee (el manager, migración 20261027070000): horas y cubetas son las de
   * aquí y el pago no se calcula (earnings null); el pago está en Nómina
   */
  partElsewhere?: boolean;
  /** Horas estimadas (turno sin cerrar) */
  estimated?: boolean;
  variety: string | null;
  team_leader_name: string | null;
  orchard_name: string | null;
}

export interface QualitySummary {
  total: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  reject: number;
  score: number; // 0-100, A=100, B=70, C=40, reject=0
  /**
   * Criterios con regular / mal en las inspecciones del periodo (solo los que
   * fallaron alguna vez, el peor primero). Vacío si las inspecciones no traen
   * criterios (formato anterior).
   */
  flaggedCriteria: CriterionFailureCount[];
}

export interface RiskBadge {
  type: 'fatigue' | 'chronic_topup' | 'quality_drop' | 'anomalous_scans';
  severity: 'warning' | 'critical';
  label: string;
  detail: string;
}

export interface PickerHistory {
  profile: PickerProfile;
  todayBuckets: number;
  todayHours: number;
  todayEarnings: number;
  dailyRecords: DailyRecord[];
  quality: QualitySummary;
  riskBadges: RiskBadge[];
  teamLeadersWorkedWith: string[];
  varietiesPicked: string[];
}

// --- Service ---
class PickerHistoryService {
  async getPickerHistory(
    pickerId: string,
    orchardId: string,
    days: number = 14,
    orchardName?: string,
  ): Promise<PickerHistory | null> {
    try {
      // 1. Get picker profile
      const picker = await pickerHistoryRepository.getPickerById(pickerId);

      if (!picker) {
        logger.warn('[PickerHistory] Picker not found:', pickerId);
        return null;
      }

      // 2. Get team leader name
      let teamLeaderName: string | null = null;
      if (picker.team_leader_id) {
        teamLeaderName = await pickerHistoryRepository.getUserName(picker.team_leader_id);
      }

      // 3. Get attendance (last N days)
      // Fechas en hora NZ (antes UTC: los escaneos de antes de las 13:00 caían en el día anterior)
      const sinceStr = nzDateOf(new Date(Date.now() - days * 86_400_000));
      const sinceIso = nzMidnight(sinceStr);

      const attendance = await pickerHistoryRepository.getAttendanceSince(pickerId, sinceStr);

      // 4. Get bucket records (last N days)
      const buckets = await pickerHistoryRepository.getBucketRecordsSince(pickerId, sinceIso);

      // 5. Get quality inspections
      const inspections = await pickerHistoryRepository.getInspectionsSince(pickerId, sinceIso);

      // 6. Get day setups for variety info
      const daySetups = await pickerHistoryRepository.getDaySetupsSince(orchardId, sinceStr);
      // Precio de cada día (piece_rates): un cambio de hoy no reescribe los días pasados
      const priceBook = await pieceRatesRepository.loadForPay(sinceStr, nzDateOf(new Date())).catch(() => null);
      const { rates, orchardFallbacks } = priceBook ?? { rates: [], orchardFallbacks: {} as Record<string, number> };
      // Huertos cuyo precio lee esta cuenta (el suyo; admin, RRHH y nómina, todos).
      // Sin respuesta del servidor no se oculta nada (se usa el respaldo, como antes).
      const pricedOrchards = priceBook
        ? new Set<string>([orchardId, ...rates.map(r => r.orchardId ?? ''), ...Object.keys(orchardFallbacks)])
        : null;
      const orchardNames = await loadOrchardNames().catch(() => ({} as Record<string, string>));
      // Días con trabajo en otro huerto (solo fechas): si aquí no se ven sus filas,
      // el día está incompleto y su pago no se puede calcular
      const daysElsewhere = await Promise.resolve()
        .then(() => pickerHistoryRepository.getDaysElsewhere(pickerId, sinceStr))
        .catch(() => new Set<string>());

      // --- Compute daily records ---
      // Horas y pago de cada día con el cálculo único (harvestMetrics/pay.ts):
      // descanso no pagado, complemento al mínimo del día, festivos ×1.5,
      // rechazos de QC y registros borrados fuera, fechas NZ.
      const dailyMap = new Map<string, DailyRecord>();
      const today = nzDateOf(new Date());
      type AttRow = { date: string; orchard_id?: string | null; check_in?: string | null; check_out?: string | null; break_start?: string | null; break_minutes?: number | null; deleted_at?: string | null };
      type BktRow = { scanned_at: string; orchard_id?: string | null; variety?: string | null; quality_grade?: string | null; deleted_at?: string | null };

      // Varios tramos el mismo día (p. ej. mañana en un huerto y tarde en otro)
      const attByDay = new Map<string, AttRow[]>();
      (attendance as AttRow[]).filter(a => !a.deleted_at).forEach(a => {
        const list = attByDay.get(a.date) ?? [];
        list.push(a);
        attByDay.set(a.date, list);
      });
      const bktByDay = new Map<string, BktRow[]>();
      (buckets as BktRow[]).filter(b => !b.deleted_at && b.scanned_at).forEach(b => {
        const day = nzDateOf(b.scanned_at);
        const list = bktByDay.get(day) ?? [];
        list.push(b);
        bktByDay.set(day, list);
      });

      for (const date of new Set([...attByDay.keys(), ...bktByDay.keys()])) {
        const shifts = attByDay.get(date) ?? [];
        const dayBuckets = bktByDay.get(date) ?? [];
        const setup = daySetups.find((d: { date: string }) => d.date === date);
        const fallback = setup?.piece_rate || 6.5;
        const [pay] = payForRange({
          attendance: shifts.map(a => attendanceRowOf({ ...a, picker_id: pickerId, date })),
          buckets: dayBuckets.map(b => ({
            pickerId, scannedAt: b.scanned_at, qualityGrade: b.quality_grade, orchardId: b.orchard_id, variety: b.variety,
            pieceRate: pieceRateOn(rates, b.orchard_id, b.variety, nzDateOf(b.scanned_at), orchardFallbacks[b.orchard_id ?? ''] ?? fallback),
          })),
          pieceRate: fallback,
          minWage: setup?.min_wage_rate || PAY_RULES.minWageFloor,
        });
        if (!pay) continue;
        const unpriced = !!pricedOrchards && dayBuckets.some(b => !!b.orchard_id && !pricedOrchards.has(b.orchard_id));
        const partElsewhere = daysElsewhere.has(date)
          && !shifts.some(s => !!s.orchard_id && s.orchard_id !== orchardId)
          && !dayBuckets.some(b => !!b.orchard_id && b.orchard_id !== orchardId);
        const noPay = unpriced || partElsewhere;
        dailyMap.set(date, {
          date,
          buckets: pay.buckets,
          hours: pay.hours,
          earnings: noPay ? null : pay.total,
          topUp: noPay ? undefined : pay.topUp,
          ...(partElsewhere ? { partElsewhere: true } : {}),
          estimated: pay.estimatedDays > 0,
          // Variedades recogidas ese día y huertos donde trabajó (puede ser más de uno)
          variety: [...new Set(dayBuckets.map(b => b.variety).filter((v): v is string => !!v))].join(', ') || setup?.variety || null,
          team_leader_name: teamLeaderName,
          orchard_name: [...new Set(shifts.map(s => s.orchard_id).filter((o): o is string => !!o))]
            .map(o => orchardNames[o] ?? o.slice(0, 8)).join(' + ') || orchardName || null,
        });
      }

      const dailyRecords = Array.from(dailyMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      // --- Today's stats ---
      const todayRecord = dailyMap.get(today);
      const todayBuckets = todayRecord?.buckets ?? 0;
      const todayHours = todayRecord?.hours || 0;
      const todayEarnings = todayRecord?.earnings ?? 0;

      // --- Quality summary ---
      const quality = this.computeQuality(inspections);

      // --- Risk badges ---
      const riskBadges = this.computeRiskBadges(attendance, dailyRecords, quality, daySetups);

      // --- Team leaders worked with ---
      const teamLeadersWorkedWith = [
        ...new Set(dailyRecords.map(r => r.team_leader_name).filter(Boolean) as string[]),
      ];

      // --- Varieties picked ---
      const varietiesPicked = [
        ...new Set(dailyRecords.map(r => r.variety).filter(Boolean) as string[]),
      ];

      return {
        profile: {
          id: picker.id,
          picker_id: picker.picker_id,
          name: picker.name,
          team_leader_id: picker.team_leader_id,
          team_leader_name: teamLeaderName,
          status: picker.status,
          created_at: picker.created_at,
        },
        todayBuckets,
        todayHours,
        todayEarnings,
        dailyRecords,
        quality,
        riskBadges,
        teamLeadersWorkedWith,
        varietiesPicked,
      };
    } catch (error) {
      logger.error('[PickerHistory] Error fetching history:', error);
      return null;
    }
  }

  private computeQuality(inspections: Array<{ quality_grade: string | null; criteria?: unknown }>): QualitySummary {
    const total = inspections.length;
    if (total === 0) return { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, score: 0, flaggedCriteria: [] };

    const gradeA = inspections.filter(
      i => i.quality_grade === 'A' || i.quality_grade === 'good'
    ).length;
    const gradeB = inspections.filter(
      i => i.quality_grade === 'B' || i.quality_grade === 'warning'
    ).length;
    const gradeC = inspections.filter(i => i.quality_grade === 'C').length;
    const reject = inspections.filter(
      i => i.quality_grade === 'reject' || i.quality_grade === 'bad'
    ).length;
    const score = Math.round((gradeA * 100 + gradeB * 70 + gradeC * 40) / total);
    // Criterios (null en inspecciones antiguas: countCriteriaFailures los ignora)
    const flaggedCriteria = countCriteriaFailures(inspections).filter(c => c.total > 0);

    return { total, gradeA, gradeB, gradeC, reject, score, flaggedCriteria };
  }

  private computeRiskBadges(
    attendance: Array<{ date: string; status: string }>,
    dailyRecords: DailyRecord[],
    quality: QualitySummary,
    _daySetups?: Array<{ date: string; piece_rate: number; min_wage_rate: number }>
  ): RiskBadge[] {
    const badges: RiskBadge[] = [];

    // 🔋 Fatigue: 10+ consecutive days worked
    const sortedDates = attendance
      .filter(a => a.status === 'present' || a.status === 'late')
      .map(a => a.date)
      .sort();
    let consecutiveDays = 1;
    let maxConsecutive = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) {
        consecutiveDays++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveDays);
      } else {
        consecutiveDays = 1;
      }
    }
    if (maxConsecutive >= 10) {
      badges.push({
        type: 'fatigue',
        severity: maxConsecutive >= 14 ? 'critical' : 'warning',
        label: 'Fatigue Risk',
        detail: `${maxConsecutive} consecutive days worked without rest`,
      });
    }

    // 💸 Chronic Top-Up: needed min wage subsidy >60% of days
    if (dailyRecords.length >= 5) {
      // Días con complemento según el cálculo único (solo los días con pago conocido)
      const paidDays = dailyRecords.filter(r => r.earnings !== null);
      const topUpDays = paidDays.filter(r => (r.topUp ?? 0) > 0).length;
      const topUpRatio = paidDays.length > 0 ? topUpDays / paidDays.length : 0;
      if (paidDays.length >= 5 && topUpRatio > 0.6) {
        badges.push({
          type: 'chronic_topup',
          severity: topUpRatio > 0.8 ? 'critical' : 'warning',
          label: 'Chronic Top-Up',
          detail: `Needed wage subsidy ${Math.round(topUpRatio * 100)}% of days (${topUpDays}/${paidDays.length})`,
        });
      }
    }

    // 📉 Quality Drop: score < 50
    if (quality.total >= 3 && quality.score < 50) {
      badges.push({
        type: 'quality_drop',
        severity: quality.score < 30 ? 'critical' : 'warning',
        label: 'Low Quality',
        detail: `Quality score ${quality.score}/100 (${quality.reject} rejects)`,
      });
    }

    return badges;
  }
}

export const pickerHistoryService = new PickerHistoryService();

