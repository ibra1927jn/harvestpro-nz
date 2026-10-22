-- =============================================================================
-- Cubetas por día NZ y nota (predicciones del panel del manager)
--
-- predictYield / analyzeQualityTrends pedían 14 días de cubetas sin paginar
-- (~40.000 filas por huerto): PostgREST devolvía las 1000 más antiguas y la
-- predicción se hacía con medio día de datos (prueba de carga 2026-10-21).
-- Ahora el servidor devuelve ~60 filas ya contadas.
-- SECURITY INVOKER: el RLS de bucket_records decide qué se ve.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bucket_daily_grades(p_orchard_id uuid, p_since timestamptz)
RETURNS TABLE (day date, quality_grade text, buckets bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT (b.scanned_at AT TIME ZONE 'Pacific/Auckland')::date AS day,
           b.quality_grade,
           count(*) AS buckets
    FROM public.bucket_records b
    WHERE b.orchard_id = p_orchard_id
      AND b.scanned_at >= p_since
      AND b.deleted_at IS NULL
    GROUP BY 1, 2
    ORDER BY 1, 2
$$;
COMMENT ON FUNCTION public.bucket_daily_grades(uuid, timestamptz) IS
    'Cubetas por día NZ y nota de un huerto desde una fecha (RLS de bucket_records).';
REVOKE ALL ON FUNCTION public.bucket_daily_grades(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bucket_daily_grades(uuid, timestamptz) TO authenticated;
