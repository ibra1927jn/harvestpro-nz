-- =============================================================================
-- Precio por cubeta por día, huerto y variedad (auditoría 23-10, A4)
--
-- Decisión del dueño (23-10): «Cuando se cambia el precio de la cubeta es solo
-- para el día de hoy, para la variedad de hoy y en el huerto de hoy. Si se sigue
-- en el mismo huerto pero se cambia la variedad, el precio cambia.»
--
-- Antes: harvest_settings.piece_rate (uno por huerto) y variety_rates (por
-- variedad) no tenían fecha; el motor de pago aplicaba la tarifa de HOY a toda
-- la semana y al cambiar el precio se recalculaban los días pasados.
--
-- Ahora: piece_rates guarda el precio por (huerto, variedad, día desde el que
-- vale). variety NULL = precio general del huerto. El precio de un día es la
-- fila de esa variedad con la mayor effective_date <= ese día; si no hay, la
-- general del huerto igual; si no, harvest_settings.piece_rate. Así:
--   · cambiar el precio hoy solo afecta a las cubetas de hoy de ese huerto y
--     esa variedad; los días anteriores conservan el suyo;
--   · si mañana nadie lo cambia, sigue valiendo el último fijado.
-- Regla del motor: pieceRateOn() en src/services/harvestMetrics/pay.ts.
--
-- Escritura: manager de SU huerto, solo de hoy en adelante (no reescribe el
-- pasado); admin de cualquier huerto y día salvo días de una semana de pago
-- cerrada. Lectura: todo miembro activo (todos los roles ven el precio).
--
-- variety_rates queda en solo lectura para la app (ya no se usa, no se borra);
-- se arregla su RLS: el manager solo escribe las de su huerto (antes cualquier
-- manager escribía las de cualquier huerto y las de la empresa).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.piece_rates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    orchard_id uuid NOT NULL REFERENCES public.orchards(id) ON DELETE CASCADE,
    -- NULL = precio general del huerto (vale para variedades sin precio propio)
    variety text,
    effective_date date NOT NULL,
    piece_rate numeric(10,2) NOT NULL CHECK (piece_rate >= 0),
    set_by uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT piece_rates_variety_not_blank CHECK (variety IS NULL OR btrim(variety) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS piece_rates_orchard_variety_day
    ON public.piece_rates (orchard_id, lower(coalesce(variety, '')), effective_date);
-- Búsqueda del último precio anterior a una fecha (piece_rates_as_of)
CREATE INDEX IF NOT EXISTS idx_piece_rates_orchard_date
    ON public.piece_rates (orchard_id, effective_date DESC);

COMMENT ON TABLE public.piece_rates IS
  'Precio por cubeta por huerto, variedad (NULL = general del huerto) y día desde el que vale. El precio de un día es la fila con la mayor effective_date <= ese día; cambiarlo hoy no toca los días anteriores.';

DROP TRIGGER IF EXISTS trg_piece_rates_updated_at ON public.piece_rates;
CREATE TRIGGER trg_piece_rates_updated_at
    BEFORE UPDATE ON public.piece_rates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Los cambios de tarifa quedan auditados (como harvest_settings)
DROP TRIGGER IF EXISTS audit_piece_rates ON public.piece_rates;
CREATE TRIGGER audit_piece_rates
    AFTER INSERT OR UPDATE OR DELETE ON public.piece_rates
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.piece_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read piece rates" ON public.piece_rates;
CREATE POLICY "Members read piece rates" ON public.piece_rates
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_member()));

-- Manager: su huerto y de hoy (hora NZ) en adelante. Admin: cualquier huerto y día.
DROP POLICY IF EXISTS "Managers set piece rates" ON public.piece_rates;
CREATE POLICY "Managers set piece rates" ON public.piece_rates
    FOR ALL TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager']))
            AND orchard_id = (SELECT public.get_my_orchard_id())
            AND effective_date >= (SELECT (now() AT TIME ZONE 'Pacific/Auckland')::date))
    )
    WITH CHECK (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager']))
            AND orchard_id = (SELECT public.get_my_orchard_id())
            AND effective_date >= (SELECT (now() AT TIME ZONE 'Pacific/Auckland')::date))
    );

-- Nadie cambia el precio de un día de una semana de pago ya cerrada
-- (la nómina exportada dejaría de cuadrar). Para corregirlo, reabrir la semana.
DROP POLICY IF EXISTS "Piece rates of closed pay weeks are frozen" ON public.piece_rates;
CREATE POLICY "Piece rates of closed pay weeks are frozen" ON public.piece_rates
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (NOT public.is_pay_day_closed(effective_date))
    WITH CHECK (NOT public.is_pay_day_closed(effective_date));
DROP POLICY IF EXISTS "Piece rates of closed pay weeks cannot be added" ON public.piece_rates;
CREATE POLICY "Piece rates of closed pay weeks cannot be added" ON public.piece_rates
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (NOT public.is_pay_day_closed(effective_date));
DROP POLICY IF EXISTS "Piece rates of closed pay weeks cannot be removed" ON public.piece_rates;
CREATE POLICY "Piece rates of closed pay weeks cannot be removed" ON public.piece_rates
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (NOT public.is_pay_day_closed(effective_date));

-- 2FA en el servidor (20261014000000_server_side_mfa), como toda tabla de public
DROP POLICY IF EXISTS "Require 2FA for privileged roles" ON public.piece_rates;
CREATE POLICY "Require 2FA for privileged roles" ON public.piece_rates
    AS RESTRICTIVE FOR ALL TO public
    USING ((SELECT public.mfa_satisfied()))
    WITH CHECK ((SELECT public.mfa_satisfied()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piece_rates TO authenticated;
REVOKE ALL ON public.piece_rates FROM anon;

-- ── Último precio vigente en una fecha ──────────────────────────────────────
-- Por cada (huerto, variedad) la fila con la mayor effective_date <= p_date.
-- Quien calcula un rango carga las filas del rango + esto en el día de inicio.
-- SECURITY INVOKER: respeta el RLS de quien consulta.
CREATE OR REPLACE FUNCTION public.piece_rates_as_of(p_date date, p_orchard_ids uuid[] DEFAULT NULL)
RETURNS SETOF public.piece_rates
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT DISTINCT ON (pr.orchard_id, lower(coalesce(pr.variety, ''))) pr.*
    FROM public.piece_rates pr
    WHERE pr.effective_date <= p_date
      AND (p_orchard_ids IS NULL OR pr.orchard_id = ANY (p_orchard_ids))
    ORDER BY pr.orchard_id, lower(coalesce(pr.variety, '')), pr.effective_date DESC;
$$;
REVOKE ALL ON FUNCTION public.piece_rates_as_of(date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piece_rates_as_of(date, uuid[]) TO authenticated, service_role;

-- ── Rellenar con lo que hay ─────────────────────────────────────────────────
-- Desde la primera cubeta de cada huerto (o 2000-01-01 si no tiene): así los
-- días ya pagados conservan exactamente el precio con el que se calcularon.
WITH first_day AS (
    SELECT o.id AS orchard_id,
           COALESCE((SELECT min((br.scanned_at AT TIME ZONE 'Pacific/Auckland')::date)
                     FROM public.bucket_records br WHERE br.orchard_id = o.id),
                    DATE '2000-01-01') AS d
    FROM public.orchards o
)
INSERT INTO public.piece_rates (orchard_id, variety, effective_date, piece_rate, set_by)
SELECT hs.orchard_id, NULL, fd.d, hs.piece_rate, NULL
FROM public.harvest_settings hs
JOIN first_day fd ON fd.orchard_id = hs.orchard_id
WHERE hs.piece_rate IS NOT NULL
ON CONFLICT DO NOTHING;

-- Precio de variedad: el del huerto; el de la empresa (orchard_id NULL) se copia
-- a cada huerto que no tenga uno propio para esa variedad.
WITH first_day AS (
    SELECT o.id AS orchard_id,
           COALESCE((SELECT min((br.scanned_at AT TIME ZONE 'Pacific/Auckland')::date)
                     FROM public.bucket_records br WHERE br.orchard_id = o.id),
                    DATE '2000-01-01') AS d
    FROM public.orchards o
),
expanded AS (
    SELECT vr.orchard_id, btrim(vr.variety) AS variety, vr.piece_rate
    FROM public.variety_rates vr
    WHERE vr.orchard_id IS NOT NULL AND btrim(vr.variety) <> ''
    UNION ALL
    SELECT o.id, btrim(vr.variety), vr.piece_rate
    FROM public.variety_rates vr
    CROSS JOIN public.orchards o
    WHERE vr.orchard_id IS NULL AND btrim(vr.variety) <> ''
      AND NOT EXISTS (SELECT 1 FROM public.variety_rates own
                      WHERE own.orchard_id = o.id AND lower(btrim(own.variety)) = lower(btrim(vr.variety)))
)
INSERT INTO public.piece_rates (orchard_id, variety, effective_date, piece_rate, set_by)
SELECT e.orchard_id, e.variety, fd.d, e.piece_rate, NULL
FROM expanded e
JOIN first_day fd ON fd.orchard_id = e.orchard_id
ON CONFLICT DO NOTHING;

-- Primer precio general de un huerto sin historial (p. ej. un huerto creado
-- después de esta migración): antes de guardarlo se deja el precio que tenía
-- (harvest_settings.piece_rate) como general desde siempre. Sin esa fila, los
-- días anteriores caerían al fallback (harvest_settings.piece_rate, que la app
-- actualiza con el precio de hoy) y se recalcularían hacia atrás.
CREATE OR REPLACE FUNCTION public.seed_orchard_piece_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rate numeric(10,2);
BEGIN
    IF NEW.variety IS NULL AND NEW.effective_date > DATE '2000-01-01' AND NOT EXISTS (
        SELECT 1 FROM public.piece_rates
        WHERE orchard_id = NEW.orchard_id AND variety IS NULL AND effective_date < NEW.effective_date
    ) THEN
        SELECT hs.piece_rate INTO v_rate FROM public.harvest_settings hs WHERE hs.orchard_id = NEW.orchard_id;
        IF v_rate IS NOT NULL THEN
            INSERT INTO public.piece_rates (orchard_id, variety, effective_date, piece_rate, set_by)
            VALUES (NEW.orchard_id, NULL, DATE '2000-01-01', v_rate, NULL)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_orchard_piece_rate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_orchard_piece_rate ON public.piece_rates;
CREATE TRIGGER trg_seed_orchard_piece_rate
    BEFORE INSERT ON public.piece_rates
    FOR EACH ROW EXECUTE FUNCTION public.seed_orchard_piece_rate();

-- ── variety_rates: el manager solo escribe las de su huerto ─────────────────
-- (la app ya no la usa; el precio de la empresa, orchard_id NULL, solo admin)
DROP POLICY IF EXISTS "Members read variety rates" ON public.variety_rates;
CREATE POLICY "Members read variety rates" ON public.variety_rates
    FOR SELECT TO authenticated
    USING ((SELECT public.is_active_member()));
DROP POLICY IF EXISTS "Managers manage variety rates" ON public.variety_rates;
CREATE POLICY "Managers manage variety rates" ON public.variety_rates
    FOR ALL TO authenticated
    USING (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
    )
    WITH CHECK (
        (SELECT public.is_role(ARRAY['admin']))
        OR ((SELECT public.is_role(ARRAY['manager'])) AND orchard_id = (SELECT public.get_my_orchard_id()))
    );
COMMENT ON TABLE public.variety_rates IS
  'OBSOLETA desde 2026-10-23: el precio por cubeta vive en piece_rates (por día). Se conserva solo para consulta.';

-- ── Realtime: el TL y el runner ven el precio nuevo sin recargar ────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'piece_rates') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.piece_rates;
    END IF;
END;
$$;
