/**
 * harvestMetrics/index.ts — Public API del módulo
 *
 * Re-exporta todas las funciones y tipos del módulo.
 * Los consumidores sólo importan desde aquí.
 */

export type { PickerMetrics } from './perPicker';
export { computePerPicker } from './perPicker';

export type { HarvestKPIs } from './kpis';
export { computeKPIs } from './kpis';

export type { TeamMetrics } from './perTeam';
export { computePerTeam } from './perTeam';

export { rankByEfficiency } from './efficiency';

export { deriveHoursWorked, deriveHoursPerPicker, HOURS_NO_DATA } from './hours';

export { computeHoursElapsed } from './projection';

export type { DrilldownData, DrilldownPickerRow } from './drilldown';
export { drilldownForHour } from './drilldown';

export type { DayRollup } from './weekly';
export { weeklySeries } from './weekly';

export type { HoursSource, ShiftInput, ShiftHours, DayPayInput, DayPay, PayWeek, AttendanceRow, BucketRow, PickerRangePay, PayDay, PaySegment } from './pay';
export { PAY_RULES, shiftHours, dayPay, nzDateOf, payWeekOf, payForRange, isNZPublicHoliday, NZ_PUBLIC_HOLIDAYS, pieceRateFor } from './pay';
