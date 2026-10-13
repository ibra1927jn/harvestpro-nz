/**
 * Predictions Service — Yield forecasting and labour demand estimation
 *
 * Uses historical harvest data with linear regression and moving averages
 * to predict:
 * - Daily yield per orchard/block
 * - Labour demand for upcoming days
 * - Quality grade trend trajectory
 *
 * No external ML needed — uses simple statistical methods that work
 * well with seasonal agricultural data patterns.
 *
 * @module services/predictions.service
 */
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import { addDaysYMD, dateInNZST, todayNZST } from '@/utils/nzst';

// =============================================
// TYPES
// =============================================

export interface YieldPrediction {
  date: string;
  predicted_buckets: number;
  confidence: number; // 0-1
  actual_buckets?: number;
  variance_pct?: number;
}

export interface LabourDemand {
  date: string;
  recommended_pickers: number;
  recommended_runners: number;
  expected_buckets: number;
  picker_target_per_day: number;
}

export interface QualityTrend {
  date: string;
  grade_a_pct: number;
  grade_b_pct: number;
  grade_c_pct: number;
  reject_pct: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface PredictionDashboard {
  yield_predictions: YieldPrediction[];
  labour_demand: LabourDemand[];
  quality_trends: QualityTrend[];
  summary: {
    predicted_total_7d: number;
    avg_daily_yield: number;
    recommended_crew_size: number;
    quality_trajectory: 'improving' | 'stable' | 'declining';
  };
}

// =============================================
// STATISTICAL HELPERS
// =============================================

/** Simple linear regression: returns [slope, intercept] */
function linearRegression(points: Array<{ x: number; y: number }>): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y || 0 };

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/** Moving average with configurable window */
function movingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

// =============================================
// SERVICE
// =============================================

export const predictionsService = {
  /**
   * Predict daily yield for the next N days based on historical data.
   * Uses 14-day lookback with linear regression + 3-day moving average smoothing.
   */
  async predictYield(orchardId: string, daysAhead: number = 7): Promise<YieldPrediction[]> {
    logger.info(`[Predictions] Predicting yield for ${orchardId}, ${daysAhead} days ahead`);

    // Get last 14 days of bucket records
    const lookbackDays = 14;
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const { data: records } = await supabase
      .from('bucket_records')
      .select('scanned_at')
      .eq('orchard_id', orchardId)
      .gte('scanned_at', startDate.toISOString())
      .order('scanned_at');

    if (!records?.length) {
      return Array.from({ length: daysAhead }, (_, i) => ({
        date: addDaysYMD(todayNZST(), i + 1),
        predicted_buckets: 0,
        confidence: 0,
      }));
    }

    // Aggregate by day
    const dailyCounts = new Map<string, number>();
    for (const r of records) {
      // Día de NZ del escaneo (no el día UTC)
      const day = dateInNZST(r.scanned_at);
      dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
    }

    // Build regression points
    const sortedDays = Array.from(dailyCounts.entries()).sort();
    const points = sortedDays.map(([, count], i) => ({ x: i, y: count }));
    const { slope, intercept } = linearRegression(points);

    // Smooth with moving average
    const values = sortedDays.map(([, count]) => count);
    const smoothed = movingAverage(values, 3);
    const lastSmoothed = smoothed[smoothed.length - 1] || 0;

    // Predict future days (blend regression + last smoothed value)
    const predictions: YieldPrediction[] = [];
    for (let i = 1; i <= daysAhead; i++) {
      const regressionValue = slope * (points.length + i - 1) + intercept;
      const blended = Math.round(regressionValue * 0.4 + lastSmoothed * 0.6);
      const predicted = Math.max(0, blended);

      // Confidence decreases with distance
      const confidence = Math.max(0.3, 1 - i * 0.08);

      predictions.push({
        date: addDaysYMD(todayNZST(), i),
        predicted_buckets: predicted,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    return predictions;
  },

  /**
   * Estimate labour demand based on predicted yield.
   * Assumes each picker handles ~80 buckets/day on average.
   */
  async predictLabourDemand(orchardId: string, daysAhead: number = 7): Promise<LabourDemand[]> {
    const yieldPredictions = await this.predictYield(orchardId, daysAhead);
    const pickerTargetPerDay = 80; // Average buckets per picker per day

    return yieldPredictions.map(yp => {
      const recommendedPickers = Math.max(1, Math.ceil(yp.predicted_buckets / pickerTargetPerDay));
      const recommendedRunners = Math.max(1, Math.ceil(recommendedPickers / 8)); // 1 runner per 8 pickers

      return {
        date: yp.date,
        recommended_pickers: recommendedPickers,
        recommended_runners: recommendedRunners,
        expected_buckets: yp.predicted_buckets,
        picker_target_per_day: pickerTargetPerDay,
      };
    });
  },

  /**
   * Analyze quality grade trends over time.
   * Groups by day and calculates grade distribution percentages.
   */
  async analyzeQualityTrends(orchardId: string, lookbackDays: number = 7): Promise<QualityTrend[]> {
    const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const { data: records } = await supabase
      .from('bucket_records')
      .select('scanned_at, quality_grade')
      .eq('orchard_id', orchardId)
      .gte('scanned_at', startDate.toISOString())
      .order('scanned_at');

    if (!records?.length) return [];

    // Group by day
    const dailyGrades = new Map<string, Map<string, number>>();
    for (const r of records) {
      // Día de NZ del escaneo (no el día UTC)
      const day = dateInNZST(r.scanned_at);
      if (!dailyGrades.has(day)) dailyGrades.set(day, new Map());
      const grade = (r.quality_grade || 'ungraded').toUpperCase();
      const normalized = grade === 'A' ? 'A' : grade === 'B' ? 'B' : grade === 'C' ? 'C' : 'reject';
      const grades = dailyGrades.get(day)!;
      grades.set(normalized, (grades.get(normalized) || 0) + 1);
    }

    const trends: QualityTrend[] = [];
    const gradeAHistory: number[] = [];

    for (const [day, grades] of Array.from(dailyGrades.entries()).sort()) {
      const total = Array.from(grades.values()).reduce((a, b) => a + b, 0);
      const pct = (g: string) => Math.round(((grades.get(g) || 0) / total) * 100);
      const gradeA = pct('A');
      gradeAHistory.push(gradeA);

      // Determine trend based on 3-day window
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (gradeAHistory.length >= 3) {
        const recent = gradeAHistory.slice(-3);
        const delta = recent[2] - recent[0];
        if (delta > 5) trend = 'improving';
        else if (delta < -5) trend = 'declining';
      }

      trends.push({
        date: day,
        grade_a_pct: gradeA,
        grade_b_pct: pct('B'),
        grade_c_pct: pct('C'),
        reject_pct: pct('reject'),
        trend,
      });
    }

    return trends;
  },

  /**
   * Get full prediction dashboard.
   */
  async getDashboard(orchardId: string): Promise<PredictionDashboard> {
    const [yieldPredictions, labourDemand, qualityTrends] = await Promise.all([
      this.predictYield(orchardId, 7),
      this.predictLabourDemand(orchardId, 7),
      this.analyzeQualityTrends(orchardId, 14),
    ]);

    const predicted7d = yieldPredictions.reduce((sum, p) => sum + p.predicted_buckets, 0);
    const avgDaily = Math.round(predicted7d / 7);
    const avgCrew =
      labourDemand.length > 0
        ? Math.round(
            labourDemand.reduce((s, l) => s + l.recommended_pickers, 0) / labourDemand.length
          )
        : 0;
    const lastTrend = qualityTrends[qualityTrends.length - 1]?.trend || 'stable';

    return {
      yield_predictions: yieldPredictions,
      labour_demand: labourDemand,
      quality_trends: qualityTrends,
      summary: {
        predicted_total_7d: predicted7d,
        avg_daily_yield: avgDaily,
        recommended_crew_size: avgCrew,
        quality_trajectory: lastTrend,
      },
    };
  },
};
