-- =============================================================================
-- Equipos de pickers: quién mete, mueve y saca gente de un equipo
--
-- Regla del dueño (2026-10-16):
--   · El team leader solo trabaja con SU equipo: da de alta gente nueva en su
--     equipo, edita a su gente y puede coger a alguien que no tiene equipo.
--   · El team leader NO suelta a nadie, no lo pasa a otro equipo, no lo da de
--     baja ni lo borra. Eso lo hace RRHH (hr_admin) o admin.
--   · El manager no da de alta, baja ni mueve pickers (20_people.sql) y no
--     borra filas de la plantilla.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

-- Más gente para las pruebas: un picker del otro equipo, uno sin equipo y uno
-- sin equipo pero ya dado de baja
DO $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-A-TL2', 'SecTest picker of team leader 2', sec_test.id_of('A'), sec_test.id_of('A.team_leader2'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_tl2', v_id);

    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-A-FREE', 'SecTest picker without team', sec_test.id_of('A'), NULL, 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_free', v_id);

    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status, archived_at)
    VALUES ('SECTEST-A-GONE', 'SecTest archived picker', sec_test.id_of('A'), NULL, 'picker', 'archived', now())
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_gone', v_id);
END $$;

-- ── Team leader: su propio equipo ───────────────────────────────────────────
SELECT sec_test.allow('A.team_leader', 'adds a new picker to own team',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id) VALUES ('SECTEST-NEW1', 'New', {A}, {A.team_leader})$$);
SELECT sec_test.allow('A.team_leader', 'renames a picker of own team', $$UPDATE pickers SET name = 'Renamed' WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.team_leader', 'sets the harness number of own picker', $$UPDATE pickers SET harness_number = 'H-17' WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.team_leader', 'moves own team to a row', $$UPDATE pickers SET current_row = 4 WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.team_leader', 'takes a picker who has no team', $$UPDATE pickers SET team_leader_id = auth.uid() WHERE id = {A.picker_free}$$);

-- ── Team leader: lo que es de RRHH ──────────────────────────────────────────
SELECT sec_test.deny('A.team_leader', 'cannot release a picker from own team', $$UPDATE pickers SET team_leader_id = NULL WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot pass own picker to another team', $$UPDATE pickers SET team_leader_id = {A.team_leader2} WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot archive a picker', $$UPDATE pickers SET status = 'archived', archived_at = now() WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot set a picker inactive', $$UPDATE pickers SET status = 'inactive' WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot soft-delete a picker', $$UPDATE pickers SET deleted_at = now() WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot delete a picker', $$DELETE FROM pickers WHERE id = {A.picker_free}$$);
SELECT sec_test.deny('A.team_leader', 'cannot change a picker''s role', $$UPDATE pickers SET role = 'team_leader' WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot change a picker''s home orchard', $$UPDATE pickers SET orchard_id = {B} WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot bring back an archived picker', $$UPDATE pickers SET team_leader_id = auth.uid(), status = 'active', archived_at = NULL WHERE id = {A.picker_gone}$$);

-- ── Team leader: gente de otros equipos ─────────────────────────────────────
SELECT sec_test.deny('A.team_leader', 'cannot take a picker from another team', $$UPDATE pickers SET team_leader_id = auth.uid() WHERE id = {A.picker_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot rename a picker of another team', $$UPDATE pickers SET name = 'Hacked' WHERE id = {A.picker_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot set the harness number on another team', $$UPDATE pickers SET harness_number = 'H-99' WHERE id = {A.picker_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot mark safety on another team', $$UPDATE pickers SET safety_verified = false WHERE id = {A.picker_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot archive a picker of another team', $$UPDATE pickers SET status = 'archived' WHERE id = {A.picker_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot touch a picker of another orchard', $$UPDATE pickers SET team_leader_id = auth.uid() WHERE id = {B.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot edit another team leader''s row', $$UPDATE pickers SET name = 'Hacked' WHERE id = {A.team_leader2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot add a picker to another team',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id) VALUES ('SECTEST-NEW2', 'New', {A}, {A.team_leader2})$$);
SELECT sec_test.deny('A.team_leader', 'cannot add a picker without team',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id) VALUES ('SECTEST-NEW3', 'New', {A}, NULL)$$);
SELECT sec_test.deny('A.team_leader', 'cannot add someone with another role',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id, role) VALUES ('SECTEST-NEW4', 'New', {A}, {A.team_leader}, 'team_leader')$$);
SELECT sec_test.deny('A.team_leader', 'cannot add someone already archived',
    $$INSERT INTO pickers (picker_id, name, orchard_id, team_leader_id, status) VALUES ('SECTEST-NEW5', 'New', {A}, {A.team_leader}, 'archived')$$);

-- ── RRHH y admin: mover, soltar, dar de baja y borrar ───────────────────────
SELECT sec_test.allow(w, 'moves a picker to another team', $$UPDATE pickers SET team_leader_id = {A.team_leader2} WHERE id = {A.picker}$$)
FROM unnest(ARRAY['A.hr_admin', 'A.admin']) AS w;
SELECT sec_test.allow('A.hr_admin', 'releases a picker from a team', $$UPDATE pickers SET team_leader_id = NULL WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.hr_admin', 'archives a picker', $$UPDATE pickers SET status = 'archived', archived_at = now() WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.hr_admin', 'deletes a picker', $$DELETE FROM pickers WHERE id = {A.picker_free}$$);

-- ── Manager: no borra filas de la plantilla ─────────────────────────────────
SELECT sec_test.deny('A.manager', 'cannot delete a runner row', $$DELETE FROM pickers WHERE id = {A.runner}$$);
SELECT sec_test.deny('A.manager', 'cannot delete a team leader row', $$DELETE FROM pickers WHERE id = {A.team_leader2}$$);
SELECT sec_test.allow('A.manager', 'still unlinks a runner from the orchard', $$UPDATE pickers SET orchard_id = NULL, team_leader_id = NULL WHERE id = {A.runner}$$);

-- ── Otros roles: ni tocan equipos ───────────────────────────────────────────
SELECT sec_test.deny(w, 'cannot take a picker who has no team', $$UPDATE pickers SET team_leader_id = auth.uid() WHERE id = {A.picker_free}$$)
FROM unnest(ARRAY['A.runner', 'A.qc_inspector', 'A.logistics', 'A.payroll_admin']) AS w;

SELECT sec_test.finish();
ROLLBACK;
