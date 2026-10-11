-- ============================================================================
-- Descanso de comida en daily_attendance
-- Regla de negocio (2026-10-11): 30 min no pagados; el team leader anota en la
-- hoja de horas a qué hora fue. Si no se anota y el turno pasa de 4 h, el
-- cálculo (src/services/harvestMetrics/pay.ts) descuenta igualmente 30 min.
-- Migración aditiva: no cambia datos existentes.
-- ============================================================================

ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS break_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_minutes SMALLINT NOT NULL DEFAULT 30
    CHECK (break_minutes >= 0 AND break_minutes <= 120);

COMMENT ON COLUMN public.daily_attendance.break_start IS
  'Hora de inicio del descanso de comida (no pagado), anotada por el team leader.';
COMMENT ON COLUMN public.daily_attendance.break_minutes IS
  'Minutos de descanso no pagados. 30 por defecto.';
