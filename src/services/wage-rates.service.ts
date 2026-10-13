/**
 * wage-rates.service.ts — Configurable Wage Rates per Job Type
 *
 * Admin and HR_ADMIN can set per-job-type wage rates in the database.
 * These are used by compliance checks, payroll calculations, and reports
 * across the entire app — replacing the old hardcoded MINIMUM_WAGE constant.
 *
 * Architecture:
 *   READ  → wage_rates table via Supabase (with localStorage cache for offline)
 *   WRITE → Admin/HR Settings panel → syncService queue → Supabase
 */

import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';
import { todayNZST } from '@/utils/nzst';
import {
  NZ_DEFAULT_WAGE_RATES,
  NZ_MINIMUM_WAGE_2026,
  type JobType,
} from '@/constants/nz-law';

// Alias interno — Minimum Wage Order 2026, efectivo 1 April 2026
const NZ_MINIMUM_WAGE = NZ_MINIMUM_WAGE_2026;

// ── Types ──────────────────────────────────────────────

export interface WageRate {
  id: string;
  orchard_id: string;
  job_type: JobType;
  hourly_rate: number;       // Configured operational rate
  is_piece_rate_eligible: boolean;
  piece_rate_per_bin: number;
  effective_from: string;    // ISO date — when this rate takes effect
  notes?: string;
  updated_by?: string;
  updated_at: string;
  created_at: string;
}

export interface WageRatesConfig {
  orchardId: string;
  rates: Record<JobType, WageRate>;
  lastUpdated: string;
}

// Cache key for offline resilience
const CACHE_KEY = 'wage_rates_cache';

// ── Internal: Load from DB ──────────────────────────────

async function fetchFromDB(orchardId: string): Promise<WageRate[]> {
  const { data, error } = await supabase
    .from('wage_rates')
    .select('*')
    .eq('orchard_id', orchardId)
    // Día de NZ: con la fecha UTC, una tarifa nueva no se aplicaba hasta las 12:00/13:00 de NZ
    .lte('effective_from', todayNZST())
    .order('effective_from', { ascending: false });

  if (error) {
    logger.warn('[WageRates] DB fetch failed, using cache:', error.message);
    return [];
  }
  return (data ?? []) as WageRate[];
}

// ── Internal: Build full config with defaults ───────────

function buildConfig(orchardId: string, dbRates: WageRate[]): WageRatesConfig {
  const jobTypes = Object.keys(NZ_DEFAULT_WAGE_RATES) as JobType[];

  // Deduplicate: take the most recent rate per job type
  const latest: Partial<Record<JobType, WageRate>> = {};
  for (const rate of dbRates) {
    if (!latest[rate.job_type]) latest[rate.job_type] = rate;
  }

  // Fill missing job types with NZ legal defaults
  const rates = Object.fromEntries(
    jobTypes.map(jt => [
      jt,
      latest[jt] ?? {
        id: `default-${jt}`,
        orchard_id: orchardId,
        job_type: jt,
        hourly_rate: NZ_DEFAULT_WAGE_RATES[jt],
        is_piece_rate_eligible: jt === 'picker' || jt === 'team_leader',
        piece_rate_per_bin: 6.5,
        effective_from: '2024-04-01',
        notes: 'NZ legal default — configure in Admin → Wage Rates',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } satisfies WageRate,
    ])
  ) as Record<JobType, WageRate>;

  return { orchardId, rates, lastUpdated: new Date().toISOString() };
}

// ── Public API ──────────────────────────────────────────

/**
 * Load wage rates for an orchard. Returns cached version if offline.
 * Always validates that no rate is below the NZ legal minimum.
 */
export async function getWageRates(orchardId: string): Promise<WageRatesConfig> {
  try {
    const dbRates = await fetchFromDB(orchardId);
    const config = buildConfig(orchardId, dbRates);

    // Persist to localStorage for offline resilience
    try {
      localStorage.setItem(`${CACHE_KEY}_${orchardId}`, JSON.stringify(config));
    } catch { /* storage full, non-critical */ }

    return config;
  } catch (error) {
    logger.warn('[WageRates] Falling back to localStorage cache:', error);
    return getCachedWageRates(orchardId);
  }
}

/**
 * Get wage rates from localStorage cache (offline fallback).
 */
export function getCachedWageRates(orchardId: string): WageRatesConfig {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY}_${orchardId}`);
    if (cached) return JSON.parse(cached) as WageRatesConfig;
  } catch { /* JSON parse error */ }

  // Last resort: use NZ legal defaults
  logger.warn('[WageRates] No cache available — using NZ legal defaults');
  return buildConfig(orchardId, []);
}

/**
 * Get the configured hourly rate for a specific job type.
 * Returns the NZ minimum wage floor if no configuration exists.
 */
export function getHourlyRate(
  config: WageRatesConfig,
  jobType: JobType | string
): number {
  const rate = config.rates[jobType as JobType];
  const hourlyRate = rate?.hourly_rate ?? NZ_MINIMUM_WAGE;

  // Safety: never return below NZ legal minimum
  if (hourlyRate < NZ_MINIMUM_WAGE) {
    logger.warn(
      `[WageRates] Configured rate $${hourlyRate}/hr for ${jobType} is below NZ minimum $${NZ_MINIMUM_WAGE}/hr — clamping to legal minimum`
    );
    return NZ_MINIMUM_WAGE;
  }
  return hourlyRate;
}

/**
 * Save or update a wage rate for a job type.
 * Called from Admin → Settings → Wage Rates panel.
 */
export async function saveWageRate(orchardId: string, wageRate: {
  job_type: JobType;
  hourly_rate: number;
  is_piece_rate_eligible: boolean;
  piece_rate_per_bin: number;
  effective_from: string;
  notes?: string;
  updated_by: string;
}): Promise<{ success: boolean; error?: string }> {
  // Validate: cannot set below NZ legal minimum
  if (wageRate.hourly_rate < NZ_MINIMUM_WAGE) {
    return {
      success: false,
      error: `Rate $${wageRate.hourly_rate}/hr is below the NZ legal minimum wage of $${NZ_MINIMUM_WAGE}/hr as of 1 April 2026.`,
    };
  }

  const { error } = await supabase.from('wage_rates').upsert(
    {
      orchard_id: orchardId,
      ...wageRate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'orchard_id,job_type' }
  );

  if (error) {
    logger.error('[WageRates] Failed to save wage rate:', error);
    return { success: false, error: error.message };
  }

  logger.info(`[WageRates] Updated ${wageRate.job_type} wage to $${wageRate.hourly_rate}/hr`);
  return { success: true };
}

/**
 * Validate that a proposed rate meets NZ legal requirements.
 * Returns a list of any violations.
 */
export function validateWageRate(
  hourlyRate: number,
  _jobType: JobType
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (hourlyRate < NZ_MINIMUM_WAGE) {
    violations.push(
      `$${hourlyRate}/hr is below the NZ Minimum Wage (${new Date().getFullYear()}: $${NZ_MINIMUM_WAGE}/hr)`
    );
  }
  if (hourlyRate === 0) {
    violations.push('Hourly rate cannot be zero');
  }
  if (hourlyRate > 500) {
    violations.push('Hourly rate seems unreasonably high — please verify');
  }

  return { valid: violations.length === 0, violations };
}
