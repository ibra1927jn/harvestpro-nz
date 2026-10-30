-- =============================================================================
-- Invitaciones (allowed_registrations, B1 de la auditoría 2026-10-23,
-- migración 20261023040000): quién invita, reenvía y anula; caducidad.
-- Invitan admin y RRHH (RRHH no invita admins). Nadie más ve ni toca
-- invitaciones; la persona invitada solo comprueba la suya (check_registration).
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Una invitación caducada de A y la persona que intenta usarla
INSERT INTO sec_test.ids VALUES ('A.invite_expired', gen_random_uuid());
INSERT INTO public.allowed_registrations (id, email, assigned_role, orchard_id, expires_at)
VALUES (sec_test.id_of('A.invite_expired'), 'sectest.expired-a@example.test', 'runner', sec_test.id_of('A'), now() - interval '1 day');
DO $$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (id, email, aud, role) VALUES (v_id, 'sectest.expired-a@example.test', 'authenticated', 'authenticated');
    INSERT INTO sec_test.who VALUES ('A.expired_invitee', v_id, 'sectest.expired-a@example.test');
END $$;

-- ── Leer ────────────────────────────────────────────────────────────────────
SELECT sec_test.sees(w, 'lists invitations', $$SELECT 1 FROM allowed_registrations WHERE id = {A.invite}$$, 1)
FROM unnest(ARRAY['A.admin', 'A.hr_admin']) AS w;
SELECT sec_test.sees(w, 'cannot list invitations', $$SELECT 1 FROM allowed_registrations WHERE id = {A.invite}$$, 0)
FROM unnest(ARRAY['anon', 'A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.payroll_admin', 'A.inactive_manager', 'A.hr_admin@aal1', 'A.admin@aal1']) AS w;

-- ── Invitar ─────────────────────────────────────────────────────────────────
SELECT sec_test.allow(w, 'invites any field or office role',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id, full_name)
      SELECT 'sectest.inv-' || r || '-' || (SELECT current_setting('request.jwt.claims', true)::json ->> 'sub') || '@example.test', r, {A}, 'New person'
      FROM unnest(ARRAY['manager', 'team_leader', 'runner', 'qc_inspector', 'hr_admin', 'payroll_admin', 'logistics']) AS r$$)
FROM unnest(ARRAY['A.admin', 'A.hr_admin']) AS w;
SELECT sec_test.allow('A.admin', 'invites an admin',
    $$INSERT INTO allowed_registrations (email, assigned_role) VALUES ('sectest.inv-admin@example.test', 'admin')$$);
SELECT sec_test.deny('A.hr_admin', 'cannot invite an admin',
    $$INSERT INTO allowed_registrations (email, assigned_role) VALUES ('sectest.inv-admin2@example.test', 'admin')$$);
SELECT sec_test.deny('A.hr_admin', 'cannot turn an invitation into admin',
    $$UPDATE allowed_registrations SET assigned_role = 'admin' WHERE id = {A.invite}$$);
SELECT sec_test.deny('A.hr_admin', 'cannot sign an invitation as someone else',
    $$INSERT INTO allowed_registrations (email, assigned_role, created_by) VALUES ('sectest.inv-forged@example.test', 'runner', {A.admin})$$);
SELECT sec_test.returns('A.hr_admin', 'the invitation is signed by whoever creates it and expires in 14 days',
    $$WITH ins AS (INSERT INTO allowed_registrations (email, assigned_role) VALUES ('sectest.inv-signed@example.test', 'runner')
                   RETURNING created_by, expires_at)
      SELECT (created_by = auth.uid() AND expires_at BETWEEN now() + interval '13 days' AND now() + interval '15 days')::text FROM ins$$,
    'true');
SELECT sec_test.deny(w, 'cannot invite',
    $$INSERT INTO allowed_registrations (email, assigned_role, orchard_id) VALUES ('sectest.inv-x@example.test', 'runner', {A})$$)
FROM unnest(ARRAY['anon', 'A.manager', 'A.team_leader', 'A.runner', 'A.qc_inspector', 'A.logistics',
                  'A.payroll_admin', 'A.inactive_manager', 'A.hr_admin@aal1']) AS w;

-- ── Reenviar (alarga la caducidad) y anular (borrar) ────────────────────────
SELECT sec_test.allow(w, 'resends an invitation',
    $$UPDATE allowed_registrations SET expires_at = now() + interval '14 days', resent_at = now() WHERE id = {A.invite_expired}$$)
FROM unnest(ARRAY['A.admin', 'A.hr_admin']) AS w;
SELECT sec_test.deny(w, 'cannot resend an invitation',
    $$UPDATE allowed_registrations SET expires_at = now() + interval '14 days' WHERE id = {A.invite_expired}$$)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.payroll_admin']) AS w;
SELECT sec_test.allow(w, 'revokes an invitation', $$DELETE FROM allowed_registrations WHERE id = {A.invite}$$)
FROM unnest(ARRAY['A.admin', 'A.hr_admin']) AS w;
SELECT sec_test.deny(w, 'cannot revoke an invitation', $$DELETE FROM allowed_registrations WHERE id = {A.invite}$$)
FROM unnest(ARRAY['A.manager', 'A.team_leader', 'A.runner', 'A.payroll_admin']) AS w;

-- ── Caducidad ───────────────────────────────────────────────────────────────
SELECT sec_test.sees('anon', 'an expired invitation is not offered at sign-up',
    $$SELECT * FROM check_registration('sectest.expired-a@example.test')$$, 0);
SELECT sec_test.sees('anon', 'a valid invitation is offered at sign-up',
    $$SELECT * FROM check_registration('sectest.invite-a@example.test')$$, 1);
SELECT sec_test.deny('A.expired_invitee', 'cannot register with an expired invitation',
    $$INSERT INTO users (id, email, full_name, role, orchard_id) VALUES (auth.uid(), 'sectest.expired-a@example.test', 'Late', 'runner', {A})$$);
SELECT sec_test.allow('A.invitee', 'registers with a valid invitation',
    $$INSERT INTO users (id, email, full_name, role, orchard_id) VALUES (auth.uid(), 'sectest.invite-a@example.test', 'New', 'runner', {A})$$);

SELECT sec_test.finish();
ROLLBACK;
