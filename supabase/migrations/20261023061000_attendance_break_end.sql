-- =============================================================================
-- Descanso desde el pase de lista (auditoría 2026-10-23, D): el team leader
-- marca inicio y fin del descanso de cada persona, también sin cobertura.
--
-- break_end: cuándo terminó el descanso. Con él, la pantalla sabe quién está
-- ahora en descanso y reintentar «fin de descanso» desde la cola sin red no
-- cambia nada (idempotente). break_minutes pasa a ser lo que duró de verdad
-- (0–120); las horas pagables siguen saliendo de break_start + break_minutes
-- (pay-rules.ts, sin cambios). Filas antiguas: break_end NULL (sin rellenar:
-- no se reescriben hojas ya revisadas).
-- El trigger de día cerrado ya bloquea cambiar esta columna en un día cerrado.
-- =============================================================================

ALTER TABLE public.daily_attendance
    ADD COLUMN IF NOT EXISTS break_end timestamptz;

ALTER TABLE public.daily_attendance DROP CONSTRAINT IF EXISTS daily_attendance_break_end_check;
ALTER TABLE public.daily_attendance ADD CONSTRAINT daily_attendance_break_end_check
    CHECK (break_end IS NULL OR (break_start IS NOT NULL AND break_end >= break_start));

COMMENT ON COLUMN public.daily_attendance.break_end IS
    'Fin del descanso anotado en el pase de lista (manage-attendance break_end). NULL = en descanso o sin anotar.';
