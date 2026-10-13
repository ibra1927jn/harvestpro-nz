-- =============================================================================
-- rejected_scans: escaneos de cubetas que el servidor NO aceptó (semana/día de
-- pago cerrado, persona archivada, tarjeta desconocida, hora imposible) y los
-- que aceptó pero con la hora dudosa (reloj del móvil desfasado, escaneo muy
-- antiguo). Antes solo quedaban en el móvil del runner: el manager no se
-- enteraba.
--
-- Lo escribe record-bucket con el JWT del runner (RLS: solo lo suyo y en su
-- huerto). Lo leen manager (su huerto) y admin; quien lo reportó ve lo suyo
-- (lo necesita INSERT ... ON CONFLICT DO NOTHING, y ya lo tiene en su móvil).
-- Nadie lo edita ni lo borra.
-- Idempotente: el id es el del escaneo en el móvil (un reenvío no duplica).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rejected_scans (
    id           uuid PRIMARY KEY,
    orchard_id   uuid REFERENCES public.orchards(id) DEFAULT public.get_my_orchard_id(),
    reported_by  uuid NOT NULL REFERENCES public.users(id) DEFAULT auth.uid(),
    picker_code  text NOT NULL,
    picker_id    uuid REFERENCES public.pickers(id) ON DELETE SET NULL,
    scanned_at   timestamptz,
    quality_grade text,
    kind         text NOT NULL DEFAULT 'rejected' CHECK (kind IN ('rejected', 'flagged')),
    reason       text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rejected_scans_orchard_created
    ON public.rejected_scans (orchard_id, created_at DESC);

ALTER TABLE public.rejected_scans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rejected_scans FROM anon;
GRANT SELECT, INSERT ON public.rejected_scans TO authenticated;

DROP POLICY IF EXISTS "Managers read rejected scans" ON public.rejected_scans;
CREATE POLICY "Managers read rejected scans" ON public.rejected_scans FOR SELECT TO authenticated
    USING (
        public.is_role(ARRAY['admin'])
        OR (public.is_role(ARRAY['manager']) AND orchard_id = public.get_my_orchard_id())
        OR (reported_by = auth.uid() AND public.is_role(ARRAY['team_leader', 'runner']))
    );

DROP POLICY IF EXISTS "Scanners report own rejected scans" ON public.rejected_scans;
CREATE POLICY "Scanners report own rejected scans" ON public.rejected_scans FOR INSERT TO authenticated
    WITH CHECK (
        reported_by = auth.uid()
        AND public.is_role(ARRAY['admin', 'manager', 'team_leader', 'runner'])
        AND (orchard_id = public.get_my_orchard_id() OR public.is_role(ARRAY['admin']))
    );

COMMENT ON TABLE public.rejected_scans IS
    'Bucket scans the server rejected (kind=rejected) or saved with a doubtful time (kind=flagged). Written by record-bucket with the scanner''s JWT; read by managers/admin.';
