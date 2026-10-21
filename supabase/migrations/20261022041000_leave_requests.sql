-- =============================================================================
-- Ausencias y permisos (revisión 21-10, #18): tabla leave_requests
--
-- La Agenda de RRHH gestiona los próximos días: vacaciones, baja por
-- enfermedad, duelo, violencia familiar, sin sueldo, día libre u otro. La
-- tabla era un "placeholder" desde abril (CalendarTab decía que no existía).
--
-- Personas: pickers(id). En este proyecto toda persona de campo está en
-- pickers y las que tienen cuenta tienen pickers.id = users.id
-- (20261012010000_people_single_source). El personal de oficina sin fila en
-- pickers no entra todavía (se verá con "Mi cuenta", #10).
--
-- Quién hace qué (decisión provisional, ver PR):
--   · Pide (INSERT, status = requested): RRHH y admin para cualquier huerto;
--     manager y team leader para su huerto. requested_by = quien pide.
--     RRHH/admin pueden registrarla ya aprobada (p. ej. una baja conocida).
--   · Decide (UPDATE: aprobar / rechazar / cancelar): RRHH y admin; el manager
--     en su huerto. Nadie decide sobre su propia ausencia (restrictiva), salvo
--     admin.
--   · Lee: miembros del huerto; RRHH, nómina y admin de toda la empresa.
--   · Nadie borra filas: se cancela (status) o deleted_at.
-- Efecto: una ausencia aprobada que cubre hoy pone a la persona on_leave en
-- RRHH. TODO (fuera de alcance): quitarla del pase de lista del TL y del plan
-- del día.
-- Funciones de rol envueltas en (SELECT ...) para que se evalúen una vez.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    orchard_id      uuid NOT NULL REFERENCES public.orchards(id) ON DELETE CASCADE,
    picker_id       uuid NOT NULL REFERENCES public.pickers(id) ON DELETE CASCADE,
    type            text NOT NULL CHECK (type IN (
                        'annual', 'sick', 'bereavement', 'family_violence', 'unpaid', 'day_off', 'other')),
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    half_day        boolean NOT NULL DEFAULT false,
    reason          text CHECK (reason IS NULL OR length(reason) <= 500),
    status          text NOT NULL DEFAULT 'requested' CHECK (status IN (
                        'requested', 'approved', 'rejected', 'cancelled')),
    requested_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at      timestamptz,
    decision_note   text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    CONSTRAINT leave_requests_dates_check CHECK (end_date >= start_date),
    -- Medio día = un solo día
    CONSTRAINT leave_requests_half_day_check CHECK (NOT half_day OR start_date = end_date)
);

COMMENT ON TABLE public.leave_requests IS
  'Ausencias y permisos por persona (Agenda de RRHH). Una fila aprobada que cubre hoy = on_leave. El pago de la ausencia lo calcula el programa de nóminas.';
COMMENT ON COLUMN public.leave_requests.picker_id IS 'Persona (pickers.id; = users.id si tiene cuenta).';
COMMENT ON COLUMN public.leave_requests.type IS 'annual | sick | bereavement | family_violence | unpaid | day_off | other';
COMMENT ON COLUMN public.leave_requests.status IS 'requested → approved | rejected | cancelled';

CREATE INDEX IF NOT EXISTS idx_leave_requests_orchard_start
    ON public.leave_requests (orchard_id, start_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_requests_picker_start
    ON public.leave_requests (picker_id, start_date) WHERE deleted_at IS NULL;

-- updated_at automático (misma función que el resto de tablas)
DROP TRIGGER IF EXISTS leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER leave_requests_updated_at
    BEFORE UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.leave_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.leave_requests TO authenticated;

-- Lectura: miembros activos del huerto; RRHH, nómina y admin de toda la empresa
-- (get_my_orchard_id no mira is_active; is_role sí: una cuenta dada de baja no lee)
DROP POLICY IF EXISTS "Read leave requests" ON public.leave_requests;
CREATE POLICY "Read leave requests" ON public.leave_requests
    FOR SELECT TO authenticated
    USING (
        (
            orchard_id = (SELECT public.get_my_orchard_id())
            AND (SELECT public.is_role(ARRAY['manager', 'team_leader', 'runner', 'qc_inspector', 'logistics']))
        )
        OR (SELECT public.is_role(ARRAY['hr_admin', 'payroll_admin', 'admin']))
    );

-- Pedir: RRHH/admin (cualquier huerto, cualquier estado); manager y team
-- leader de su huerto, siempre como "requested". Quien pide queda registrado.
DROP POLICY IF EXISTS "Request leave" ON public.leave_requests;
CREATE POLICY "Request leave" ON public.leave_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        requested_by = (SELECT auth.uid())
        AND deleted_at IS NULL
        AND (
            (SELECT public.is_role(ARRAY['hr_admin', 'admin']))
            OR (
                (SELECT public.is_role(ARRAY['manager', 'team_leader']))
                AND orchard_id = (SELECT public.get_my_orchard_id())
                AND status = 'requested'
            )
        )
    );

-- Decidir (aprobar / rechazar / cancelar): RRHH y admin; el manager en su huerto
DROP POLICY IF EXISTS "Decide leave requests" ON public.leave_requests;
CREATE POLICY "Decide leave requests" ON public.leave_requests
    FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['hr_admin', 'admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
    )
    WITH CHECK (
        (SELECT public.is_role(ARRAY['hr_admin', 'admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
    );

-- Nadie decide sobre su propia ausencia (salvo admin)
DROP POLICY IF EXISTS "No self leave decision" ON public.leave_requests;
CREATE POLICY "No self leave decision" ON public.leave_requests
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (
        picker_id IS DISTINCT FROM (SELECT auth.uid())
        OR (SELECT public.is_role(ARRAY['admin']))
    );
