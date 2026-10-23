-- =============================================================================
-- RLS: funciones de rol evaluadas una vez por consulta, no una vez por fila
--
-- Las políticas llaman a funciones como get_my_orchard_id(), is_manager(),
-- is_role(ARRAY[...]), can_read_company_payroll() o auth.uid(). Escritas así,
-- Postgres las ejecuta para CADA fila que mira (son SECURITY DEFINER y cada
-- llamada consulta public.users). En la prueba de carga (2026-10-21) leer 7.869
-- cubetas como Nómina tardaba 1,5–2,3 s (≈250 µs por fila solo en el RLS): la
-- nómina de una semana de la empresa (~60.000 cubetas) pasaba del límite de 8 s
-- y calculate-payroll fallaba con "statement timeout" ya el primer día de carga.
--
-- Envueltas en (SELECT f()) Postgres las calcula una vez (InitPlan) y reutiliza
-- el resultado: el mismo resultado (todas son STABLE y no dependen de la fila),
-- sin el coste por fila. Es la recomendación de Supabase para RLS con volumen.
--
-- Se hace con ALTER POLICY sobre las políticas existentes (mismo nombre, mismos
-- roles, mismo comando, misma lógica); solo cambia cómo se escriben las llamadas.
-- Las que ya estaban envueltas (p. ej. la de 2FA) no se tocan.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.rls_wrap(expr text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    out text := expr;
BEGIN
    IF out IS NULL THEN
        RETURN NULL;
    END IF;
    -- is_role(ARRAY['a'::text, ...]) → (SELECT is_role(ARRAY[...]))
    out := regexp_replace(out, '(?<!SELECT )\mis_role\((ARRAY\[[^\]]*\])\)', '(SELECT is_role(\1))', 'g');
    -- Funciones sin argumentos que solo dependen de quién llama
    out := regexp_replace(
        out,
        '(?<!SELECT )\m(auth\.uid|auth\.role|auth\.jwt|get_auth_orchard_id|get_auth_role|get_my_orchard_id|is_active_member|is_hr_manager_or_admin|is_logistics_or_manager|is_manager_or_leader|is_manager|can_read_company_payroll|is_company_logistics|mfa_satisfied)\(\)',
        '(SELECT \1())',
        'g'
    );
    RETURN out;
END $$;

DO $$
DECLARE
    p record;
    new_qual text;
    new_check text;
    n int := 0;
BEGIN
    FOR p IN
        SELECT pol.polname,
               format('%I.%I', ns.nspname, cl.relname) AS tbl,
               pg_get_expr(pol.polqual, pol.polrelid) AS qual,
               pg_get_expr(pol.polwithcheck, pol.polrelid) AS chk
        FROM pg_policy pol
        JOIN pg_class cl ON cl.oid = pol.polrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public'
    LOOP
        new_qual := pg_temp.rls_wrap(p.qual);
        new_check := pg_temp.rls_wrap(p.chk);
        IF new_qual IS NOT DISTINCT FROM p.qual AND new_check IS NOT DISTINCT FROM p.chk THEN
            CONTINUE;
        END IF;
        EXECUTE format(
            'ALTER POLICY %I ON %s%s%s',
            p.polname,
            p.tbl,
            CASE WHEN new_qual IS NOT NULL THEN format(' USING (%s)', new_qual) ELSE '' END,
            CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END
        );
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'rls_initplan: % políticas reescritas', n;
END $$;
