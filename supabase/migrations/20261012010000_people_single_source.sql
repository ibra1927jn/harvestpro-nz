-- =============================================================================
-- Personas: una sola lista por huerto (public.pickers)
--
-- Regla (ya usada por userService.assignUserToOrchard, ahora obligatoria):
--   * pickers = toda persona que trabaja en el huerto: pickers, team leaders y
--     runners. Una cuenta de la app con rol de campo (team_leader, runner)
--     tiene su fila en pickers con EL MISMO id que en users.
--   * pickers.team_leader_id = id del team leader (users.id = pickers.id).
--     Nunca se apunta a sí mismo.
--   * pickers.status = situación laboral (active / archived). Quién está hoy
--     sale de daily_attendance; fichar ya no cambia pickers.status.
--   * El rol y la baja de una cuenta se cambian en users; este trigger lo
--     copia a pickers y al rol de la sesión (auth user_metadata.role), que es
--     el que usan las Edge Functions.
-- =============================================================================

-- 1) Cuentas de campo con huerto que no estaban en la lista
INSERT INTO public.pickers (id, picker_id, name, role, orchard_id, status, safety_verified)
SELECT u.id,
       CASE u.role WHEN 'team_leader' THEN 'TL-' ELSE 'RUN-' END || upper(substr(replace(u.id::text, '-', ''), 1, 6)),
       coalesce(nullif(u.full_name, ''), u.email, 'Unknown'),
       u.role,
       u.orchard_id,
       CASE WHEN u.is_active THEN 'active' ELSE 'archived' END,
       true
FROM public.users u
WHERE u.role IN ('team_leader', 'runner')
  AND u.orchard_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pickers p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 2) Un team leader no es su propio team leader
UPDATE public.pickers SET team_leader_id = NULL WHERE team_leader_id = id;

-- 3) Lo que fichar dejó como "inactive" vuelve a ser plantilla activa
--    (inactive solo lo escribía el check-out; la baja real es "archived")
UPDATE public.pickers SET status = 'active' WHERE status = 'inactive';

-- 4) Mantener la lista y el rol de la sesión al día desde users
CREATE OR REPLACE FUNCTION public.sync_person_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_field_role boolean := NEW.role IN ('team_leader', 'runner');
    -- Solo nombre cambiado: no tocar la situación laboral (p. ej. un archivo manual)
    only_name boolean := TG_OP = 'UPDATE'
        AND NEW.role IS NOT DISTINCT FROM OLD.role
        AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active
        AND NEW.orchard_id IS NOT DISTINCT FROM OLD.orchard_id;
BEGIN
    -- Rol de la sesión = rol de la cuenta (las Edge Functions autorizan con él)
    IF TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role THEN
        UPDATE auth.users
        SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
        WHERE id = NEW.id;
    END IF;

    IF is_field_role AND NEW.orchard_id IS NOT NULL THEN
        INSERT INTO public.pickers (id, picker_id, name, role, orchard_id, status, safety_verified)
        VALUES (
            NEW.id,
            CASE NEW.role WHEN 'team_leader' THEN 'TL-' ELSE 'RUN-' END || upper(substr(replace(NEW.id::text, '-', ''), 1, 6)),
            coalesce(nullif(NEW.full_name, ''), NEW.email, 'Unknown'),
            NEW.role,
            NEW.orchard_id,
            CASE WHEN NEW.is_active THEN 'active' ELSE 'archived' END,
            true
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            orchard_id = EXCLUDED.orchard_id,
            status = CASE WHEN only_name THEN public.pickers.status ELSE EXCLUDED.status END,
            archived_at = CASE WHEN only_name THEN public.pickers.archived_at
                               WHEN EXCLUDED.status = 'archived' THEN coalesce(public.pickers.archived_at, now())
                               ELSE NULL END;
    ELSE
        -- Ya no es de campo, sin huerto o dado de baja: sale de la lista
        UPDATE public.pickers
        SET status = 'archived', archived_at = coalesce(archived_at, now())
        WHERE id = NEW.id AND status <> 'archived';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_person_from_user ON public.users;
CREATE TRIGGER trg_sync_person_from_user
AFTER INSERT OR UPDATE OF role, is_active, full_name, orchard_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_person_from_user();

COMMENT ON COLUMN public.pickers.team_leader_id IS
  'Team leader de esta persona: id de su cuenta (users.id), que es también su fila en pickers. Nunca la propia persona.';
COMMENT ON COLUMN public.pickers.status IS
  'Situación laboral: active (en plantilla) o archived (baja). Quién está hoy sale de daily_attendance.';
