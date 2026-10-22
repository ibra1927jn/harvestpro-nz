-- =============================================================================
-- A1: una cuenta dada de baja no lee nada de su huerto aunque su token siga
-- vivo, y la baja la bloquea en Auth (ban + sesiones cerradas) venga de donde
-- venga (migración 20261023010000_deactivated_users_locked_out).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

DO $$ BEGIN
    PERFORM sec_test.make_user('A.inactive_runner', 'runner', 'A', false);
    PERFORM sec_test.make_user('A.inactive_team_leader', 'team_leader', 'A', false);
    -- Sesiones abiertas (como tras iniciar sesión en la app)
    INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
    SELECT gen_random_uuid(), sec_test.id_of(k), now(), now()
    FROM unnest(ARRAY['A.runner', 'A.runner2', 'A.inactive_runner']) AS k;
END $$;

-- Estado en Auth tras la llamada: ¿baneado (≈100 años)? y sesiones que quedan.
-- SECURITY DEFINER: authenticated no lee el esquema auth.
CREATE FUNCTION sec_test.ban_state(p_id uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT banned_until > now() + interval '50 years' FROM auth.users WHERE id = p_id), false)::text
        || '|' || (SELECT count(*) FROM auth.sessions WHERE user_id = p_id)::text;
$$;
-- Hace el cambio con la sesión del usuario (RLS y triggers de verdad) y luego mira Auth
CREATE FUNCTION sec_test.set_active_then_ban_state(p_id uuid, p_active boolean) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.users SET is_active = p_active WHERE id = p_id;
    RETURN sec_test.ban_state(p_id);
END $$;

-- ── Lectura con el token aún válido ─────────────────────────────────────────
SELECT sec_test.returns(w, 'deactivated: get_my_orchard_id() is NULL', $$SELECT get_my_orchard_id()::text$$, '<null>')
FROM unnest(ARRAY['A.inactive_runner', 'A.inactive_team_leader', 'A.inactive_manager']) AS w;
SELECT sec_test.returns('A.inactive_runner', 'deactivated: get_auth_orchard_id() is NULL', $$SELECT get_auth_orchard_id()::text$$, '<null>');
SELECT sec_test.sees(w, 'deactivated: reads no pickers', $$SELECT 1 FROM pickers WHERE id = {A.picker}$$, 0)
FROM unnest(ARRAY['A.inactive_runner', 'A.inactive_team_leader', 'A.inactive_manager']) AS w;
SELECT sec_test.sees(w, 'deactivated: reads no bucket records', $$SELECT 1 FROM bucket_records WHERE id = {A.bucket}$$, 0)
FROM unnest(ARRAY['A.inactive_runner', 'A.inactive_team_leader', 'A.inactive_manager']) AS w;
SELECT sec_test.sees(w, 'deactivated: reads no attendance', $$SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 0)
FROM unnest(ARRAY['A.inactive_runner', 'A.inactive_team_leader', 'A.inactive_manager']) AS w;
SELECT sec_test.sees(w, 'deactivated: reads no colleagues', $$SELECT 1 FROM users WHERE id = {A.manager}$$, 0)
FROM unnest(ARRAY['A.inactive_runner', 'A.inactive_team_leader']) AS w;
-- La app lee la fila propia para saber que la cuenta está de baja
SELECT sec_test.sees('A.inactive_runner', 'deactivated: still reads own profile row', $$SELECT 1 FROM users WHERE id = auth.uid()$$, 1);
-- Las cuentas activas siguen igual
SELECT sec_test.sees(w, 'active: reads own orchard pickers, buckets and attendance',
    $$SELECT 1 FROM pickers WHERE id = {A.picker}
      UNION ALL SELECT 1 FROM bucket_records WHERE id = {A.bucket}
      UNION ALL SELECT 1 FROM daily_attendance WHERE id = {A.att}$$, 3)
FROM unnest(ARRAY['A.runner', 'A.team_leader', 'A.qc_inspector']) AS w;

-- ── Baja = ban en Auth y sesiones cerradas, por cualquier vía ───────────────
SELECT sec_test.returns('A.runner', 'before: not banned, one open session', $$SELECT sec_test.ban_state({A.runner})$$, 'false|1');
-- RRHH (setEmployeeActive → users.is_active por PostgREST)
SELECT sec_test.returns('A.hr_admin', 'HR deactivation bans the account and closes its sessions',
    $$SELECT sec_test.set_active_then_ban_state({A.runner}, false)$$, 'true|0');
-- Admin (manage-admin)
SELECT sec_test.returns('A.admin', 'admin deactivation bans the account and closes its sessions',
    $$SELECT sec_test.set_active_then_ban_state({A.runner2}, false)$$, 'true|0');
-- Alta otra vez: sin ban (vuelve a iniciar sesión)
SELECT sec_test.returns('A.hr_admin', 'reactivation lifts the ban',
    $$SELECT sec_test.set_active_then_ban_state({A.inactive_runner}, true)$$, 'false|1');
-- Clave de servicio / SQL directo
DO $$ BEGIN UPDATE public.users SET is_active = false WHERE id = sec_test.id_of('A.runner2'); END $$;
SELECT sec_test.record(sec_test.ban_state(sec_test.id_of('A.runner2')) = 'true|0',
    'server: deactivation by service role / SQL also bans', sec_test.ban_state(sec_test.id_of('A.runner2')));
-- Un cambio que no toca is_active no banea
SELECT sec_test.returns('A.runner', 'renaming yourself does not ban you',
    $$WITH u AS (UPDATE users SET full_name = 'SecTest renamed' WHERE id = auth.uid() RETURNING 1)
      SELECT (SELECT count(*) FROM u)::text || '|' || sec_test.ban_state(auth.uid())$$,
    '1|false|1');

SELECT sec_test.finish();
ROLLBACK;
