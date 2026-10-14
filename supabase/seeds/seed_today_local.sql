-- seed_today_local.sql — Registros TEST del día NZ y ventana reciente para dev local
-- Orchard: e1337e6a-54cc-431c-9c00-980e8ea270a4 (Sunrise Apple Orchard)
-- Pickers: 20 activos
-- ON CONFLICT DO NOTHING — seguro para re-ejecutar
-- Datos TEST: reutiliza un runner existente del huerto local, sin crear usuarios.

DO $$
DECLARE
    scanner_id uuid;
    first_scan_at timestamptz :=
        (date_trunc('day', NOW() AT TIME ZONE 'Pacific/Auckland') + INTERVAL '7 hours 5 minutes')
        AT TIME ZONE 'Pacific/Auckland';
BEGIN
    SELECT id INTO scanner_id
    FROM public.users
    WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
      AND role = 'runner'
      AND is_active = true
    ORDER BY id
    LIMIT 1;

    IF scanner_id IS NULL THEN
        RAISE EXCEPTION 'seed_today_local requires an active runner in the local orchard; run seed_role_users.sql first';
    END IF;

-- ============================================================
-- PARTE 1: 200 registros de hoy NZ, de 07:05 a 16:28:50 (cada 170 s)
-- Pacific/Auckland aplica el desplazamiento NZST/NZDT de la fecha actual.
-- ============================================================
INSERT INTO public.bucket_records (picker_id, orchard_id, row_number, quality_grade, scanned_by, scanned_at)
SELECT
    p.id,
    'e1337e6a-54cc-431c-9c00-980e8ea270a4',
    (1 + (n % 20)) AS row_number,
    CASE (n % 4) WHEN 0 THEN 'A' WHEN 1 THEN 'A' WHEN 2 THEN 'B' ELSE 'A' END,
    scanner_id,
    first_scan_at + (n * 170 * INTERVAL '1 second')
FROM
    generate_series(0, 199) AS n,
    LATERAL (
        SELECT id FROM public.pickers
        WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
          AND status = 'active'
        ORDER BY name
        LIMIT 1
        OFFSET (n % 20)
    ) AS p
ON CONFLICT (picker_id, scanned_at) DO NOTHING;

-- ============================================================
-- PARTE 2: Registros recientes (últimas 2 horas desde NOW)
-- Para que el cálculo de velocity sea > 0
-- ============================================================
INSERT INTO public.bucket_records (picker_id, orchard_id, row_number, quality_grade, scanned_by, scanned_at)
SELECT
    p.id,
    'e1337e6a-54cc-431c-9c00-980e8ea270a4',
    (1 + (n % 20)) AS row_number,
    CASE (n % 3) WHEN 0 THEN 'A' WHEN 1 THEN 'A' ELSE 'B' END,
    scanner_id,
    NOW() - INTERVAL '90 minutes' + (n * 65 * INTERVAL '1 second')
FROM
    generate_series(0, 79) AS n,
    LATERAL (
        SELECT id FROM public.pickers
        WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
          AND status = 'active'
        ORDER BY name
        LIMIT 1
        OFFSET (n % 20)
    ) AS p
ON CONFLICT (picker_id, scanned_at) DO NOTHING;

END $$;

-- Verificación final
SELECT
    to_char(scanned_at AT TIME ZONE 'Pacific/Auckland', 'YYYY-MM-DD HH24:MI') as nz_time_sample,
    COUNT(*) as count
FROM public.bucket_records
WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
  AND scanned_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;

SELECT 'total_today_nz' as label, COUNT(*) as count
FROM public.bucket_records
WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
  AND (scanned_at AT TIME ZONE 'Pacific/Auckland')::date = (NOW() AT TIME ZONE 'Pacific/Auckland')::date;

SELECT 'in_velocity_window' as label, COUNT(*) as count
FROM public.bucket_records
WHERE orchard_id = 'e1337e6a-54cc-431c-9c00-980e8ea270a4'
  AND scanned_at > NOW() - INTERVAL '2 hours';
