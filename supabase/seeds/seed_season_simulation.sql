-- =============================================
-- SEASON SIMULATION SEED — Central Cherry Pac (1,200t)
-- Dec 15, 2025 → Feb 5, 2026
-- 18 orchards · 52 staff · 450 pickers · ~20k bucket records
--
-- ⚠️ Run with service_role key or from SQL Editor (bypasses RLS)
-- ⚠️ This script is IDEMPOTENT — safe to re-run
-- =============================================
-- Clean existing simulation data (preserve structure)
DO $$ BEGIN -- Only delete if simulation marker exists
DELETE FROM public.qc_inspections
WHERE inspector_id IN (
        SELECT id
        FROM public.users
        WHERE email LIKE '%@centralpac.sim'
    );
DELETE FROM public.bucket_records
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.daily_attendance
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.bins
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.day_setups
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.contracts
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.pickers
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    );
DELETE FROM public.orchards
WHERE code IN (
        'JP',
        'OCH',
        'ALT',
        'SMT',
        'MP3',
        'SMW',
        'ATD',
        'PSV',
        'CLU',
        'FRR',
        'CHB',
        'MOR',
        'KRG',
        'WDN',
        'GRV',
        'QTM',
        'JCC',
        'JCO'
    );
RAISE NOTICE 'Cleaned previous simulation data';
EXCEPTION
WHEN OTHERS THEN RAISE NOTICE 'Clean step skipped: %',
SQLERRM;
END $$;
-- =============================================
-- 1. ORCHARDS (18)
-- =============================================
INSERT INTO public.orchards (id, code, name, location, total_blocks)
VALUES (
        '11111111-0001-0001-0001-000000000001',
        'JP',
        'J&P Cherries',
        'Cromwell',
        10
    ),
    (
        '11111111-0001-0001-0001-000000000002',
        'OCH',
        'O''Cherry',
        'Cromwell',
        8
    ),
    (
        '11111111-0001-0001-0001-000000000003',
        'ALT',
        'Alta Cherries',
        'Cromwell',
        6
    ),
    (
        '11111111-0001-0001-0001-000000000004',
        'SMT',
        'Smiling Tiger',
        'Cromwell',
        5
    ),
    (
        '11111111-0001-0001-0001-000000000005',
        'MP3',
        'MP3',
        'Alexandra',
        7
    ),
    (
        '11111111-0001-0001-0001-000000000006',
        'SMW',
        'Smiths Way',
        'Alexandra',
        6
    ),
    (
        '11111111-0001-0001-0001-000000000007',
        'ATD',
        'Altitude Cherries',
        'Alexandra',
        9
    ),
    (
        '11111111-0001-0001-0001-000000000008',
        'PSV',
        'PisaView',
        'Cromwell',
        5
    ),
    (
        '11111111-0001-0001-0001-000000000009',
        'CLU',
        'Clutha Cherries',
        'Roxburgh',
        7
    ),
    (
        '11111111-0001-0001-0001-000000000010',
        'FRR',
        'Fraser River',
        'Roxburgh',
        6
    ),
    (
        '11111111-0001-0001-0001-000000000011',
        'CHB',
        'Chubby Cherries',
        'Cromwell',
        4
    ),
    (
        '11111111-0001-0001-0001-000000000012',
        'MOR',
        'Morris Partnership',
        'Alexandra',
        5
    ),
    (
        '11111111-0001-0001-0001-000000000013',
        'KRG',
        'Kriegnook',
        'Roxburgh',
        4
    ),
    (
        '11111111-0001-0001-0001-000000000014',
        'WDN',
        'West Dunstan',
        'Alexandra',
        6
    ),
    (
        '11111111-0001-0001-0001-000000000015',
        'GRV',
        'Grove Farm',
        'Cromwell',
        5
    ),
    (
        '11111111-0001-0001-0001-000000000016',
        'QTM',
        'Quantum Orchards',
        'Roxburgh',
        4
    ),
    (
        '11111111-0001-0001-0001-000000000017',
        'JCC',
        'JC Cherries',
        'Cromwell',
        4
    ),
    (
        '11111111-0001-0001-0001-000000000018',
        'JCO',
        'John Copland',
        'Alexandra',
        3
    ) ON CONFLICT (code) DO NOTHING;
-- ✓ Inserted 18 orchards
-- =============================================
-- 2. PICKERS (450) — 5 Attendance Tiers
-- We distribute them across orchards (25 per orchard avg)
-- =============================================
DO $$
DECLARE v_orchard_ids UUID [] := ARRAY [
        '11111111-0001-0001-0001-000000000001',
        '11111111-0001-0001-0001-000000000002',
        '11111111-0001-0001-0001-000000000003',
        '11111111-0001-0001-0001-000000000004',
        '11111111-0001-0001-0001-000000000005',
        '11111111-0001-0001-0001-000000000006',
        '11111111-0001-0001-0001-000000000007',
        '11111111-0001-0001-0001-000000000008',
        '11111111-0001-0001-0001-000000000009',
        '11111111-0001-0001-0001-000000000010',
        '11111111-0001-0001-0001-000000000011',
        '11111111-0001-0001-0001-000000000012',
        '11111111-0001-0001-0001-000000000013',
        '11111111-0001-0001-0001-000000000014',
        '11111111-0001-0001-0001-000000000015',
        '11111111-0001-0001-0001-000000000016',
        '11111111-0001-0001-0001-000000000017',
        '11111111-0001-0001-0001-000000000018'
    ];
v_first_names TEXT [] := ARRAY [
        'James','Aroha','Tane','Sofia','Liam','Maia','Nikau','Jade','Kai','Emma',
        'Matiu','Isla','Rawiri','Olivia','Wiremu','Anika','Hemi','Lily','Rua','Zoe',
        'Te Koha','Nina','Ihaka','Mia','Kahu','Eva','Tipene','Luna','Ari','Rosa',
        'Manaia','Chloe','Tama','Grace','Hoani','Freya','Eru','Poppy','Niko','Stella',
        'Rewi','Hannah','Tamati','Alice','Pita','Sarah','Rangi','Holly','Aiden','Ruby'
    ];
v_last_names TEXT [] := ARRAY [
        'Walker','Williams','Brown','Smith','Taylor','Wilson','Thompson','White',
        'Harris','Martin','Anderson','Thomas','Jackson','Clark','Robinson','Lewis',
        'Young','Hall','King','Wright','Baker','Green','Adams','Nelson','Hill',
        'Moore','Scott','Carter','Mitchell','Turner','Phillips','Campbell','Parker',
        'Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook',
        'Morgan','Bell','Murphy','Bailey','Rivera','Cooper','Richardson','Cox','Howard'
    ];
v_idx INTEGER;
v_orchard_idx INTEGER;
v_picker_name TEXT;
v_tier TEXT;
BEGIN FOR v_idx IN 1..450 LOOP -- Assign to orchards round-robin
v_orchard_idx := ((v_idx - 1) % 18) + 1;
-- Generate name
v_picker_name := v_first_names [((v_idx - 1) % 50) + 1] || ' ' || v_last_names [((v_idx * 7) % 50) + 1];
-- Determine tier: A=15%, B=35%, C=25%, D=15%, E=10%
IF v_idx <= 68 THEN v_tier := 'A';
ELSIF v_idx <= 226 THEN v_tier := 'B';
ELSIF v_idx <= 338 THEN v_tier := 'C';
ELSIF v_idx <= 406 THEN v_tier := 'D';
ELSE v_tier := 'E';
END IF;
INSERT INTO public.pickers (
        id,
        picker_id,
        name,
        orchard_id,
        safety_verified,
        status,
        current_row
    )
VALUES (
        gen_random_uuid(),
        'PKR-' || LPAD(v_idx::TEXT, 4, '0'),
        v_picker_name,
        v_orchard_ids [v_orchard_idx],
        CASE
            WHEN random() > 0.05 THEN true
            ELSE false
        END,
        CASE
            WHEN v_tier = 'E'
            AND random() > 0.6 THEN 'inactive'
            ELSE 'active'
        END,
        CASE
            WHEN random() > 0.3 THEN (random() * 20 + 1)::INTEGER
            ELSE 0
        END
    ) ON CONFLICT (picker_id) DO NOTHING;
END LOOP;
RAISE NOTICE 'Inserted 450 pickers across 18 orchards';
END $$;
-- =============================================
-- 3. DAY SETUPS (~660 — one per orchard per active day)
-- =============================================
DO $$
DECLARE v_orchard RECORD;
v_day DATE;
v_open_dates DATE [] := ARRAY [
        '2025-12-15','2025-12-15','2025-12-16','2025-12-18','2025-12-17',
        '2025-12-18','2025-12-16','2025-12-20','2025-12-17','2025-12-19',
        '2025-12-20','2025-12-22','2025-12-20','2025-12-18','2025-12-22',
        '2025-12-24','2025-12-22','2025-12-24'
    ];
v_close_dates DATE [] := ARRAY [
        '2026-02-03','2026-01-30','2026-01-28','2026-01-25','2026-02-01',
        '2026-01-30','2026-02-05','2026-01-28','2026-02-02','2026-01-30',
        '2026-01-25','2026-02-03','2026-01-28','2026-02-05','2026-01-30',
        '2026-02-05','2026-01-28','2026-02-03'
    ];
v_varieties TEXT [] [] := ARRAY [
        ARRAY['Lapin','Sweetheart','Kordia','Skeena'],
ARRAY ['Sweetheart','Staccato','Santina','Santina'],
ARRAY ['Lapin','Stella','Van','Van'],
ARRAY ['Kordia','Rainier','Kordia','Rainier'],
ARRAY ['Sweetheart','Skeena','Dawson','Dawson'],
ARRAY ['Lapin','Santina','Sam','Sam'],
ARRAY ['Kordia','Staccato','Bing','Sweetheart'],
ARRAY ['Stella','Van','Lapin','Lapin'],
ARRAY ['Sweetheart','Dawson','Skeena','Skeena'],
ARRAY ['Lapin','Santina','Sam','Sam'],
ARRAY ['Rainier','Kordia','Rainier','Kordia'],
ARRAY ['Staccato','Bing','Dawson','Dawson'],
ARRAY ['Sweetheart','Lapin','Sweetheart','Lapin'],
ARRAY ['Kordia','Skeena','Staccato','Staccato'],
ARRAY ['Stella','Santina','Van','Van'],
ARRAY ['Bing','Staccato','Bing','Staccato'],
ARRAY ['Lapin','Sweetheart','Lapin','Sweetheart'],
ARRAY ['Kordia','Rainier','Dawson','Dawson'] ];
v_base_rates DECIMAL [] := ARRAY [
        5.50, 6.00, 7.00, 5.00, 6.80, 8.00, 6.20, 5.80, 4.80, 6.00, 7.50, 5.20
    ];
v_variety_name TEXT;
v_rate DECIMAL;
v_idx INTEGER := 0;
v_orchard_num INTEGER;
BEGIN FOR v_orchard IN
SELECT id,
    code
FROM public.orchards
WHERE code IN (
        'JP',
        'OCH',
        'ALT',
        'SMT',
        'MP3',
        'SMW',
        'ATD',
        'PSV',
        'CLU',
        'FRR',
        'CHB',
        'MOR',
        'KRG',
        'WDN',
        'GRV',
        'QTM',
        'JCC',
        'JCO'
    )
ORDER BY code LOOP v_idx := v_idx + 1;
v_orchard_num := v_idx;
FOR v_day IN
SELECT d::DATE
FROM generate_series(
        v_open_dates [v_orchard_num],
        v_close_dates [v_orchard_num],
        '1 day'::INTERVAL
    ) AS d LOOP -- Rotate variety based on day
    v_variety_name := v_varieties [v_orchard_num] [(EXTRACT(DOY FROM v_day)::INTEGER % 4) + 1];
-- Base rate with seasonal adjustment
v_rate := 6.00;
-- default
CASE
    v_variety_name
    WHEN 'Lapin' THEN v_rate := 5.50;
WHEN 'Sweetheart' THEN v_rate := 6.00;
WHEN 'Kordia' THEN v_rate := 7.00;
WHEN 'Stella' THEN v_rate := 5.00;
WHEN 'Staccato' THEN v_rate := 6.80;
WHEN 'Rainier' THEN v_rate := 8.00;
WHEN 'Skeena' THEN v_rate := 6.20;
WHEN 'Santina' THEN v_rate := 5.80;
WHEN 'Van' THEN v_rate := 4.80;
WHEN 'Dawson' THEN v_rate := 6.00;
WHEN 'Bing' THEN v_rate := 7.50;
WHEN 'Sam' THEN v_rate := 5.20;
ELSE v_rate := 6.00;
END CASE
;
-- Seasonal adjustment
IF v_day >= '2025-12-29'
AND v_day <= '2026-01-10' THEN v_rate := v_rate + 0.30;
ELSIF v_day >= '2026-01-11'
AND v_day <= '2026-01-25' THEN v_rate := v_rate + 0.50;
ELSIF v_day >= '2026-01-26' THEN v_rate := v_rate + 0.30;
END IF;
INSERT INTO public.day_setups (
        orchard_id,
        date,
        variety,
        target_tons,
        piece_rate,
        min_wage_rate,
        start_time
    )
VALUES (
        v_orchard.id,
        v_day,
        v_variety_name,
        CASE
            WHEN v_day < '2025-12-22' THEN 2.5 + random() * 1.5
            WHEN v_day < '2026-01-05' THEN 3.0 + random() * 2.0
            WHEN v_day < '2026-01-20' THEN 4.0 + random() * 3.0
            ELSE 2.0 + random() * 2.0
        END,
        v_rate,
        23.50,
        '06:30'::TIME
    ) ON CONFLICT DO NOTHING;
END LOOP;
END LOOP;
RAISE NOTICE 'Inserted day setups for all orchards';
END $$;
-- =============================================
-- 4. BUCKET RECORDS (~20k sample)
-- Generate 5 sample days per week, ~45 buckets per active picker
-- =============================================
DO $$
DECLARE v_picker RECORD;
v_day DATE;
v_bucket_count INTEGER;
v_row_num INTEGER;
v_hour INTEGER;
v_minute INTEGER;
v_scan_time TIMESTAMPTZ;
v_total_buckets INTEGER := 0;
v_orchard_open DATE;
v_orchard_close DATE;
v_sample_days DATE [];
v_picker_tier TEXT;
v_picker_idx INTEGER := 0;
BEGIN -- Sample 8 representative days across the season
v_sample_days := ARRAY [
        '2025-12-18'::DATE, '2025-12-23'::DATE,
        '2026-01-02'::DATE, '2026-01-08'::DATE,
        '2026-01-14'::DATE, '2026-01-20'::DATE,
        '2026-01-27'::DATE, '2026-02-02'::DATE
    ];
FOR v_picker IN
SELECT p.id AS picker_id,
    p.orchard_id,
    p.picker_id AS badge,
    p.status
FROM public.pickers p
WHERE p.orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    )
    AND p.status = 'active'
ORDER BY p.picker_id LOOP v_picker_idx := v_picker_idx + 1;
-- Determine tier
IF v_picker_idx <= 68 THEN v_picker_tier := 'A';
ELSIF v_picker_idx <= 226 THEN v_picker_tier := 'B';
ELSIF v_picker_idx <= 338 THEN v_picker_tier := 'C';
ELSIF v_picker_idx <= 406 THEN v_picker_tier := 'D';
ELSE v_picker_tier := 'E';
END IF;
FOREACH v_day IN ARRAY v_sample_days LOOP -- Skip based on attendance probability
IF v_picker_tier = 'A'
AND random() > 0.97 THEN CONTINUE;
END IF;
IF v_picker_tier = 'B'
AND random() > 0.90 THEN CONTINUE;
END IF;
IF v_picker_tier = 'C'
AND random() > 0.80 THEN CONTINUE;
END IF;
IF v_picker_tier = 'D'
AND random() > 0.67 THEN CONTINUE;
END IF;
IF v_picker_tier = 'E'
AND random() > 0.50 THEN CONTINUE;
END IF;
-- Buckets per day based on tier
CASE
    v_picker_tier
    WHEN 'A' THEN v_bucket_count := 50 + (random() * 20)::INTEGER;
WHEN 'B' THEN v_bucket_count := 38 + (random() * 18)::INTEGER;
WHEN 'C' THEN v_bucket_count := 28 + (random() * 15)::INTEGER;
WHEN 'D' THEN v_bucket_count := 18 + (random() * 12)::INTEGER;
WHEN 'E' THEN v_bucket_count := 10 + (random() * 10)::INTEGER;
END CASE
;
-- Generate individual bucket scans across the day (7am-5pm)
v_row_num := (random() * 20 + 1)::INTEGER;
FOR i IN 1..v_bucket_count LOOP v_hour := 7 + (i * 10 / v_bucket_count);
v_minute := (random() * 59)::INTEGER;
v_scan_time := (
    v_day || ' ' || LPAD(v_hour::TEXT, 2, '0') || ':' || LPAD(v_minute::TEXT, 2, '0') || ':00+13'
)::TIMESTAMPTZ;
INSERT INTO public.bucket_records (orchard_id, picker_id, scanned_at, coords)
VALUES (
        v_picker.orchard_id,
        v_picker.picker_id,
        v_scan_time,
        jsonb_build_object(
            'lat',
            -45.03 + random() * 0.02,
            'lng',
            169.18 + random() * 0.03
        )
    );
v_total_buckets := v_total_buckets + 1;
END LOOP;
END LOOP;
-- Log progress every 50 pickers
IF v_picker_idx % 50 = 0 THEN RAISE NOTICE 'Processed % pickers, % total buckets so far',
v_picker_idx,
v_total_buckets;
END IF;
END LOOP;
RAISE NOTICE 'Inserted % total bucket records',
v_total_buckets;
END $$;
-- =============================================
-- 5. QC INSPECTIONS (~1,500 — sample from buckets)
-- =============================================
-- Inspecciones de una temporada simulada: sin avisos push (trg_push_qc_inspection
-- metería ~150 «QC: rechazo» en notification_outbox). Salen en las vistas de QC de
-- los huertos de la simulación (códigos JP, OCH…), no en los de la demo.
ALTER TABLE public.qc_inspections DISABLE TRIGGER trg_push_qc_inspection;
DO $$
DECLARE v_bucket RECORD;
v_grade TEXT;
v_count INTEGER := 0;
v_inspector UUID;
BEGIN
-- quality_inspections se borró (20261024030000): las notas van a qc_inspections,
-- que exige huerto e inspector (un usuario de la simulación, QC si lo hay)
SELECT id INTO v_inspector
FROM public.users
WHERE email LIKE '%@centralpac.sim'
ORDER BY (role = 'qc_inspector') DESC, id
LIMIT 1;
FOR v_bucket IN
SELECT id,
    picker_id,
    orchard_id,
    scanned_at
FROM public.bucket_records
WHERE orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    )
ORDER BY random()
LIMIT 1500 LOOP -- Grade distribution: A=45%, B=30%, C=15%, reject=10%
    IF random() < 0.45 THEN v_grade := 'A';
ELSIF random() < 0.75 THEN v_grade := 'B';
ELSIF random() < 0.90 THEN v_grade := 'C';
ELSE v_grade := 'reject';
END IF;
INSERT INTO public.qc_inspections (
        orchard_id,
        picker_id,
        inspector_id,
        grade,
        notes,
        created_at
    )
VALUES (
        v_bucket.orchard_id,
        v_bucket.picker_id,
        v_inspector,
        v_grade,
        CASE
            v_grade
            WHEN 'A' THEN 'Clean fruit, excellent quality'
            WHEN 'B' THEN 'Minor blemishes, acceptable'
            WHEN 'C' THEN 'Multiple issues: splits, bruising'
            WHEN 'reject' THEN 'Excessive damage, undersized, stems missing'
        END,
        v_bucket.scanned_at + INTERVAL '5 minutes'
    );
v_count := v_count + 1;
END LOOP;
RAISE NOTICE 'Inserted % QC inspections',
v_count;
END $$;
-- Vuelve a avisar de las inspecciones nuevas (solo estas del seed van sin push)
ALTER TABLE public.qc_inspections ENABLE TRIGGER trg_push_qc_inspection;
-- =============================================
-- 6. DAILY ATTENDANCE (~6,000)
-- =============================================
DO $$
DECLARE v_picker RECORD;
v_day DATE;
v_sample_days DATE [];
v_picker_idx INTEGER := 0;
v_picker_tier TEXT;
v_checkin TIMESTAMPTZ;
v_checkout TIMESTAMPTZ;
v_status TEXT;
v_hours DECIMAL;
v_count INTEGER := 0;
BEGIN v_sample_days := ARRAY [
        '2025-12-18'::DATE, '2025-12-23'::DATE,
        '2026-01-02'::DATE, '2026-01-08'::DATE,
        '2026-01-14'::DATE, '2026-01-20'::DATE,
        '2026-01-27'::DATE, '2026-02-02'::DATE,
        '2025-12-19'::DATE, '2025-12-22'::DATE,
        '2026-01-03'::DATE, '2026-01-09'::DATE,
        '2026-01-15'::DATE, '2026-01-21'::DATE,
        '2026-01-28'::DATE, '2026-02-03'::DATE
    ];
FOR v_picker IN
SELECT p.id,
    p.orchard_id,
    p.status
FROM public.pickers p
WHERE p.orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    )
ORDER BY p.picker_id LOOP v_picker_idx := v_picker_idx + 1;
IF v_picker_idx <= 68 THEN v_picker_tier := 'A';
ELSIF v_picker_idx <= 226 THEN v_picker_tier := 'B';
ELSIF v_picker_idx <= 338 THEN v_picker_tier := 'C';
ELSIF v_picker_idx <= 406 THEN v_picker_tier := 'D';
ELSE v_picker_tier := 'E';
END IF;
FOREACH v_day IN ARRAY v_sample_days LOOP -- Attendance based on tier
IF v_picker_tier = 'E'
AND random() > 0.50 THEN -- Absent
INSERT INTO public.daily_attendance (
        picker_id,
        orchard_id,
        date,
        status,
        hours_worked
    )
VALUES (
        v_picker.id,
        v_picker.orchard_id,
        v_day,
        'absent',
        0
    ) ON CONFLICT (picker_id, date) DO NOTHING;
v_count := v_count + 1;
CONTINUE;
ELSIF v_picker_tier = 'D'
AND random() > 0.70 THEN
INSERT INTO public.daily_attendance (
        picker_id,
        orchard_id,
        date,
        status,
        hours_worked
    )
VALUES (
        v_picker.id,
        v_picker.orchard_id,
        v_day,
        'absent',
        0
    ) ON CONFLICT (picker_id, date) DO NOTHING;
v_count := v_count + 1;
CONTINUE;
END IF;
-- Present or late
IF random() > 0.85 THEN v_status := 'late';
v_checkin := (
    v_day || ' 07:' || LPAD((15 + (random() * 44)::INTEGER)::TEXT, 2, '0') || ':00+13'
)::TIMESTAMPTZ;
ELSE v_status := 'present';
v_checkin := (
    v_day || ' 06:' || LPAD((20 + (random() * 30)::INTEGER)::TEXT, 2, '0') || ':00+13'
)::TIMESTAMPTZ;
END IF;
-- Check out 8-10 hours later
v_hours := 8.0 + random() * 2.0;
IF v_picker_tier = 'A' THEN v_hours := v_hours + 0.5;
END IF;
IF v_picker_tier = 'E' THEN v_hours := v_hours - 1.5;
END IF;
v_checkout := v_checkin + (v_hours || ' hours')::INTERVAL;
INSERT INTO public.daily_attendance (
        picker_id,
        orchard_id,
        date,
        check_in,
        check_out,
        status,
        hours_worked
    )
VALUES (
        v_picker.id,
        v_picker.orchard_id,
        v_day,
        v_checkin,
        v_checkout,
        v_status,
        ROUND(v_hours::DECIMAL, 2)
    ) ON CONFLICT (picker_id, date) DO NOTHING;
v_count := v_count + 1;
END LOOP;
END LOOP;
RAISE NOTICE 'Inserted % attendance records',
v_count;
END $$;
-- =============================================
-- 7. BINS (~500)
-- =============================================
DO $$
DECLARE v_orchard RECORD;
v_bin_num INTEGER := 0;
v_count INTEGER := 0;
BEGIN FOR v_orchard IN
SELECT id,
    code
FROM public.orchards
WHERE code IN (
        'JP',
        'OCH',
        'ALT',
        'SMT',
        'MP3',
        'SMW',
        'ATD',
        'PSV',
        'CLU',
        'FRR',
        'CHB',
        'MOR',
        'KRG',
        'WDN',
        'GRV',
        'QTM',
        'JCC',
        'JCO'
    ) LOOP FOR i IN 1..28 LOOP v_bin_num := v_bin_num + 1;
INSERT INTO public.bins (
        orchard_id,
        bin_code,
        status,
        variety,
        filled_at,
        location
    )
VALUES (
        v_orchard.id,
        v_orchard.code || '-BIN-' || LPAD(i::TEXT, 3, '0'),
        CASE
            WHEN random() < 0.3 THEN 'full'
            WHEN random() < 0.5 THEN 'collected'
            WHEN random() < 0.7 THEN 'partial'
            ELSE 'empty'
        END,
        CASE
            (i % 4)
            WHEN 0 THEN 'Lapin'
            WHEN 1 THEN 'Sweetheart'
            WHEN 2 THEN 'Kordia'
            ELSE 'Stella'
        END,
        CASE
            WHEN random() > 0.4 THEN now() - (random() * 30 || ' days')::INTERVAL
            ELSE NULL
        END,
        jsonb_build_object(
            'lat',
            -45.03 + random() * 0.02,
            'lng',
            169.18 + random() * 0.03
        )
    );
v_count := v_count + 1;
END LOOP;
END LOOP;
RAISE NOTICE 'Inserted % bins',
v_count;
END $$;
-- =============================================
-- 8. CONTRACTS (~450 for pickers)
-- =============================================
DO $$
DECLARE v_picker RECORD;
v_count INTEGER := 0;
BEGIN FOR v_picker IN
SELECT p.id AS picker_id,
    p.orchard_id
FROM public.pickers p
WHERE p.orchard_id IN (
        SELECT id
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    ) LOOP
INSERT INTO public.contracts (
        employee_id,
        orchard_id,
        type,
        status,
        start_date,
        end_date,
        hourly_rate
    )
VALUES (
        -- Use picker_id as employee_id for contracts (since pickers don't have auth.users entries,
        -- we skip FK constraint here — this is simulation data)
        v_picker.picker_id,
        v_picker.orchard_id,
        'seasonal',
        CASE
            WHEN random() > 0.1 THEN 'active'
            ELSE 'expired'
        END,
        '2025-12-15'::DATE + (random() * 10)::INTEGER,
        '2026-02-05'::DATE,
        23.50
    ) ON CONFLICT DO NOTHING;
v_count := v_count + 1;
END LOOP;
RAISE NOTICE 'Inserted % contracts',
v_count;
EXCEPTION
WHEN OTHERS THEN RAISE NOTICE 'Contracts insert skipped (FK constraint): %. Pickers dont have auth.users entries.',
SQLERRM;
END $$;
-- =============================================
-- SUMMARY
-- =============================================
SELECT 'SEASON SIMULATION COMPLETE' AS status,
    (
        SELECT COUNT(*)
        FROM public.orchards
        WHERE code IN (
                'JP',
                'OCH',
                'ALT',
                'SMT',
                'MP3',
                'SMW',
                'ATD',
                'PSV',
                'CLU',
                'FRR',
                'CHB',
                'MOR',
                'KRG',
                'WDN',
                'GRV',
                'QTM',
                'JCC',
                'JCO'
            )
    ) AS orchards,
    (
        SELECT COUNT(*)
        FROM public.pickers
        WHERE orchard_id IN (
                SELECT id
                FROM public.orchards
                WHERE code IN (
                        'JP',
                        'OCH',
                        'ALT',
                        'SMT',
                        'MP3',
                        'SMW',
                        'ATD',
                        'PSV',
                        'CLU',
                        'FRR',
                        'CHB',
                        'MOR',
                        'KRG',
                        'WDN',
                        'GRV',
                        'QTM',
                        'JCC',
                        'JCO'
                    )
            )
    ) AS pickers,
    (
        SELECT COUNT(*)
        FROM public.day_setups
        WHERE orchard_id IN (
                SELECT id
                FROM public.orchards
                WHERE code IN (
                        'JP',
                        'OCH',
                        'ALT',
                        'SMT',
                        'MP3',
                        'SMW',
                        'ATD',
                        'PSV',
                        'CLU',
                        'FRR',
                        'CHB',
                        'MOR',
                        'KRG',
                        'WDN',
                        'GRV',
                        'QTM',
                        'JCC',
                        'JCO'
                    )
            )
    ) AS day_setups,
    (
        SELECT COUNT(*)
        FROM public.bucket_records
        WHERE orchard_id IN (
                SELECT id
                FROM public.orchards
                WHERE code IN (
                        'JP',
                        'OCH',
                        'ALT',
                        'SMT',
                        'MP3',
                        'SMW',
                        'ATD',
                        'PSV',
                        'CLU',
                        'FRR',
                        'CHB',
                        'MOR',
                        'KRG',
                        'WDN',
                        'GRV',
                        'QTM',
                        'JCC',
                        'JCO'
                    )
            )
    ) AS bucket_records,
    (
        SELECT COUNT(*)
        FROM public.qc_inspections
        WHERE picker_id IN (
                SELECT id
                FROM public.pickers
                WHERE orchard_id IN (
                        SELECT id
                        FROM public.orchards
                        WHERE code IN (
                                'JP',
                                'OCH',
                                'ALT',
                                'SMT',
                                'MP3',
                                'SMW',
                                'ATD',
                                'PSV',
                                'CLU',
                                'FRR',
                                'CHB',
                                'MOR',
                                'KRG',
                                'WDN',
                                'GRV',
                                'QTM',
                                'JCC',
                                'JCO'
                            )
                    )
            )
    ) AS qc_inspections,
    (
        SELECT COUNT(*)
        FROM public.daily_attendance
        WHERE orchard_id IN (
                SELECT id
                FROM public.orchards
                WHERE code IN (
                        'JP',
                        'OCH',
                        'ALT',
                        'SMT',
                        'MP3',
                        'SMW',
                        'ATD',
                        'PSV',
                        'CLU',
                        'FRR',
                        'CHB',
                        'MOR',
                        'KRG',
                        'WDN',
                        'GRV',
                        'QTM',
                        'JCC',
                        'JCO'
                    )
            )
    ) AS attendance,
    (
        SELECT COUNT(*)
        FROM public.bins
        WHERE orchard_id IN (
                SELECT id
                FROM public.orchards
                WHERE code IN (
                        'JP',
                        'OCH',
                        'ALT',
                        'SMT',
                        'MP3',
                        'SMW',
                        'ATD',
                        'PSV',
                        'CLU',
                        'FRR',
                        'CHB',
                        'MOR',
                        'KRG',
                        'WDN',
                        'GRV',
                        'QTM',
                        'JCC',
                        'JCO'
                    )
            )
    ) AS bins;