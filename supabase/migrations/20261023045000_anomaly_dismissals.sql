-- =============================================================================
-- Manager › Anomalías (auditoría 2026-10-23, E): descartes reales
--
-- «Descartadas» era una lista fija en el código (fraud-detection.service). Ahora
-- el manager descarta una anomalía concreta (falsa alarma) con un motivo y se
-- guarda aquí: no vuelve a salir y el contador cuenta los descartes reales.
-- anomaly_key identifica la anomalía de forma estable entre recargas (tipo +
-- recolector + hora del evento), porque detect-anomalies genera ids nuevos en
-- cada llamada.
-- Quién: manager de su huerto y admin. Nadie edita un descarte; se puede
-- deshacer (DELETE) el propio o, admin, cualquiera.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.anomaly_dismissals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    orchard_id    uuid NOT NULL REFERENCES public.orchards(id) ON DELETE CASCADE,
    anomaly_key   text NOT NULL CHECK (length(anomaly_key) BETWEEN 1 AND 300),
    anomaly_type  text NOT NULL CHECK (length(anomaly_type) <= 50),
    picker_id     uuid REFERENCES public.pickers(id) ON DELETE SET NULL,
    picker_name   text CHECK (picker_name IS NULL OR length(picker_name) <= 120),
    detail        text CHECK (detail IS NULL OR length(detail) <= 500),
    anomaly_at    timestamptz,
    reason        text CHECK (reason IS NULL OR length(reason) <= 500),
    dismissed_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    dismissed_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT anomaly_dismissals_unique UNIQUE (orchard_id, anomaly_key)
);

COMMENT ON TABLE public.anomaly_dismissals IS
  'Anomalías (detect-anomalies) que el manager descartó como falsa alarma, con motivo. No vuelven a mostrarse.';

CREATE INDEX IF NOT EXISTS idx_anomaly_dismissals_orchard_at
    ON public.anomaly_dismissals (orchard_id, dismissed_at DESC);

ALTER TABLE public.anomaly_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anomaly_dismissals FROM anon;
GRANT SELECT, INSERT, DELETE ON public.anomaly_dismissals TO authenticated;

DROP POLICY IF EXISTS "Read anomaly dismissals" ON public.anomaly_dismissals;
CREATE POLICY "Read anomaly dismissals" ON public.anomaly_dismissals
    FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
    );

DROP POLICY IF EXISTS "Dismiss anomalies" ON public.anomaly_dismissals;
CREATE POLICY "Dismiss anomalies" ON public.anomaly_dismissals
    FOR INSERT TO authenticated
    WITH CHECK (
        dismissed_by = (SELECT auth.uid())
        AND (
            (SELECT public.is_role(ARRAY['admin']))
            OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
        )
    );

DROP POLICY IF EXISTS "Undo anomaly dismissal" ON public.anomaly_dismissals;
CREATE POLICY "Undo anomaly dismissal" ON public.anomaly_dismissals
    FOR DELETE TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR (
            (SELECT public.is_role(ARRAY['manager']))
            AND orchard_id = (SELECT public.get_my_orchard_id())
            AND dismissed_by = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON public.anomaly_dismissals;
CREATE POLICY "Require 2FA for privileged roles" ON public.anomaly_dismissals
    AS RESTRICTIVE FOR ALL TO public
    USING ((SELECT public.mfa_satisfied()))
    WITH CHECK ((SELECT public.mfa_satisfied()));
