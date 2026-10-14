-- =============================================================================
-- Descanso de comida: solo se descuenta el que anota el team leader
-- (decisión del dueño, 2026-10-14). Antes (20261011000000) si no se anotaba y
-- el turno pasaba de 4 h, el cálculo descontaba 30 min igualmente.
-- Ahora el cálculo único (src/services/harvestMetrics/pay.ts y su copia
-- supabase/functions/_shared/pay-rules.ts) descuenta SOLO break_start anotado
-- dentro del turno, y la app avisa al team leader de los turnos de más de 4 h
-- sin descanso anotado (ERA 2000 Parte 6D). Sin cambios de datos.
-- =============================================================================
COMMENT ON COLUMN public.daily_attendance.break_start IS
    'Hora de inicio del descanso de comida (no pagado), anotada por el team leader. Solo se descuenta si está anotada (dentro del turno).';
COMMENT ON COLUMN public.daily_attendance.break_minutes IS
    'Duración del descanso anotado (30 min por defecto). Sin break_start no se descuenta nada.';
