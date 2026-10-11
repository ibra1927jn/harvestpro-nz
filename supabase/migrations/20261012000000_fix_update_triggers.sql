-- =============================================================================
-- Arregla los triggers BEFORE UPDATE de daily_attendance y pickers.
--
-- Problema: cualquier UPDATE fallaba siempre.
--   1) attendance_updated_at / pickers_updated_at (set_updated_at) se ejecuta
--      primero (orden alfabético) y pone NEW.updated_at = now().
--   2) trg_*_occ (check_optimistic_lock) ve NEW.updated_at <> OLD.updated_at y
--      lanza "Optimistic lock conflict" aunque nadie más haya tocado la fila.
--   3) Además trg_bump_version_* (bump_version_and_update_time) duplica a
--      trg_*_version (bump_version): tras el primer incremento ve OLD.version
--      <> NEW.version y lanza "Conflict".
-- Consecuencia: no se podía cerrar un turno, corregir una hoja de horas ni
-- cambiar el estado o el equipo de un picker.
--
-- El bloqueo optimista ya lo hace la app con un UPDATE condicional
-- (WHERE updated_at = <esperado>, optimistic-lock.service.ts), así que estos
-- triggers sobran. Se mantienen set_updated_at y bump_version (versión +1).
-- =============================================================================

DROP TRIGGER IF EXISTS trg_attendance_occ ON public.daily_attendance;
DROP TRIGGER IF EXISTS trg_bump_version_attendance ON public.daily_attendance;

DROP TRIGGER IF EXISTS trg_pickers_occ ON public.pickers;
DROP TRIGGER IF EXISTS trg_bump_version_pickers ON public.pickers;
