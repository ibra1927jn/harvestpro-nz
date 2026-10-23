-- =============================================================================
-- Nómina › Historial de exportaciones (auditoría 2026-10-23, E): al servidor
--
-- El historial vivía en el navegador (localStorage): otro puesto o un
-- navegador limpio no lo veía, y «Delete» borraba sin preguntar. Cada
-- exportación (CSV / Xero / PaySauce / PDF) queda aquí: quién, cuándo, semana,
-- formato, archivo, filas y total. Es de la empresa (la nómina cubre todos los
-- huertos), sin huerto.
-- Quién: nómina y admin leen y registran; borrar (con confirmación en la
-- pantalla) también. Nadie edita una fila.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payroll_exports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exported_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE CASCADE,
    exported_at     timestamptz NOT NULL DEFAULT now(),
    week_start      date NOT NULL,
    week_end        date NOT NULL,
    format          text NOT NULL CHECK (format IN ('csv', 'xero', 'paysauce', 'pdf')),
    filename        text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
    record_count    integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
    total_earnings  numeric(12,2) NOT NULL DEFAULT 0,
    week_status     text CHECK (week_status IS NULL OR week_status IN ('draft', 'final')),
    CONSTRAINT payroll_exports_week_check CHECK (week_end >= week_start)
);

COMMENT ON TABLE public.payroll_exports IS
  'Historial de exportaciones de nómina (quién, cuándo, semana, formato). Antes vivía en localStorage.';

CREATE INDEX IF NOT EXISTS idx_payroll_exports_at ON public.payroll_exports (exported_at DESC);

ALTER TABLE public.payroll_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_exports FROM anon;
GRANT SELECT, INSERT, DELETE ON public.payroll_exports TO authenticated;

DROP POLICY IF EXISTS "Payroll reads exports" ON public.payroll_exports;
CREATE POLICY "Payroll reads exports" ON public.payroll_exports
    FOR SELECT TO authenticated
    USING ((SELECT public.is_role(ARRAY['payroll_admin', 'admin'])));

DROP POLICY IF EXISTS "Payroll logs exports" ON public.payroll_exports;
CREATE POLICY "Payroll logs exports" ON public.payroll_exports
    FOR INSERT TO authenticated
    WITH CHECK (
        exported_by = (SELECT auth.uid())
        AND (SELECT public.is_role(ARRAY['payroll_admin', 'admin']))
    );

DROP POLICY IF EXISTS "Payroll deletes exports" ON public.payroll_exports;
CREATE POLICY "Payroll deletes exports" ON public.payroll_exports
    FOR DELETE TO authenticated
    USING ((SELECT public.is_role(ARRAY['payroll_admin', 'admin'])));

DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON public.payroll_exports;
CREATE POLICY "Require 2FA for privileged roles" ON public.payroll_exports
    AS RESTRICTIVE FOR ALL TO public
    USING ((SELECT public.mfa_satisfied()))
    WITH CHECK ((SELECT public.mfa_satisfied()));
