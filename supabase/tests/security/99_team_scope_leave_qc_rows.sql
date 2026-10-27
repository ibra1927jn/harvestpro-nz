-- =============================================================================
-- Por EQUIPO (20261027040000_team_scoped_leave_qc_rows; decisión del dueño 27-10)
--
-- 1. Ausencias: el team leader ve solo las de SU equipo; manager (su huerto),
--    RRHH, nómina y admin como antes; cada persona, las suyas; runner, QC y
--    logística, nada (presence_today).
-- 2. Inspecciones de calidad (con el bienestar) y sus fotos: manager del huerto,
--    RRHH, admin, el team leader del equipo del picker y el inspector que la
--    hizo (solo las suyas). Runner, logística y nómina, nada.
-- 3. Filas: el manager asigna filas a cada equipo (también varias por delante);
--    el team leader solo mueve a SU equipo entre esas filas y apunta avance y fin.
-- =============================================================================
\set ON_ERROR_STOP 1
BEGIN;
\ir 00_harness.sql

DO $$
DECLARE
    v_id uuid;
    v_a uuid := sec_test.id_of('A');
    v_photo text;
BEGIN
    PERFORM sec_test.make_user('A.qc_inspector2', 'qc_inspector', 'A');

    -- Un picker del equipo del otro team leader
    INSERT INTO public.pickers (picker_id, name, orchard_id, team_leader_id, role, status)
    VALUES ('SECTEST-A-TS-TL2', 'SecTest picker of team leader 2', v_a, sec_test.id_of('A.team_leader2'), 'picker', 'active')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.picker_tl2', v_id);

    -- Ausencias: del equipo de A.team_leader ({A.picker}), del de A.team_leader2,
    -- del propio team leader y del runner (los dos son personas de campo: pickers.id = users.id)
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
    VALUES (v_a, sec_test.id_of('A.picker'), 'sick', current_date + 3, current_date + 3, sec_test.id_of('A.team_leader'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.leave', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
    VALUES (v_a, sec_test.id_of('A.picker_tl2'), 'sick', current_date + 3, current_date + 3, sec_test.id_of('A.team_leader2'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.leave_tl2', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
    VALUES (v_a, sec_test.id_of('A.team_leader'), 'annual', current_date + 5, current_date + 6, sec_test.id_of('A.manager'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.leave_tl_own', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
    VALUES (v_a, sec_test.id_of('A.runner'), 'annual', current_date + 8, current_date + 8, sec_test.id_of('A.hr_admin'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.leave_runner', v_id);
    INSERT INTO public.leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
    VALUES (sec_test.id_of('B'), sec_test.id_of('B.picker'), 'sick', current_date + 3, current_date + 3, sec_test.id_of('B.team_leader'))
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('B.leave', v_id);

    -- Inspecciones: {A.qc} (harness: A.qc_inspector → A.picker, equipo de A.team_leader),
    -- otra de A.qc_inspector al equipo de A.team_leader2 (con bienestar) y una de
    -- A.qc_inspector2 a A.picker. Cada una con su foto en la carpeta del huerto.
    v_photo := v_a::text || '/sectest/' || gen_random_uuid() || '.webp';
    UPDATE public.qc_inspections SET photo_url = (SELECT name FROM storage.objects WHERE id = sec_test.id_of('A.qc_photo'))
    WHERE id = sec_test.id_of('A.qc');
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('qc-photos', v_photo, sec_test.id_of('A.qc_inspector'), sec_test.id_of('A.qc_inspector')::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.qc_photo_tl2', v_id);
    INSERT INTO public.qc_inspections (orchard_id, picker_id, inspector_id, grade, photo_url, informed, comfortable, wellbeing_notes)
    VALUES (v_a, sec_test.id_of('A.picker_tl2'), sec_test.id_of('A.qc_inspector'), 'C', v_photo, false, false,
            'SecTest wellbeing note')
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.qc_tl2', v_id);

    v_photo := v_a::text || '/sectest/' || gen_random_uuid() || '.webp';
    INSERT INTO storage.objects (bucket_id, name, owner, owner_id)
    VALUES ('qc-photos', v_photo, sec_test.id_of('A.qc_inspector2'), sec_test.id_of('A.qc_inspector2')::text)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.qc_photo_other', v_id);
    INSERT INTO public.qc_inspections (orchard_id, picker_id, inspector_id, grade, photo_url)
    VALUES (v_a, sec_test.id_of('A.picker'), sec_test.id_of('A.qc_inspector2'), 'A', v_photo)
    RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.qc_other', v_id);

    -- Filas que asignó el manager: al equipo de A.team_leader la 1 ({A.rowasg}, harness)
    -- y la 2 por delante; al de A.team_leader2 la 3; una 4 ya terminada del equipo de A.team_leader
    INSERT INTO public.row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id)
    VALUES (v_a, 2, ARRAY[sec_test.id_of('A.picker')], sec_test.id_of('A.team_leader')) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.rowasg_ahead', v_id);
    INSERT INTO public.row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id)
    VALUES (v_a, 3, ARRAY[sec_test.id_of('A.picker_tl2')], sec_test.id_of('A.team_leader2')) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.rowasg_tl2', v_id);
    INSERT INTO public.row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id, status, ended_at, completion_percentage)
    VALUES (v_a, 4, ARRAY[sec_test.id_of('A.picker')], sec_test.id_of('A.team_leader'), 'completed', now(), 100) RETURNING id INTO v_id;
    INSERT INTO sec_test.ids VALUES ('A.rowasg_done', v_id);
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA sec_test TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Ausencias
-- ═════════════════════════════════════════════════════════════════════════════
SELECT sec_test.sees('A.team_leader', 'sees leave of own team', $$SELECT 1 FROM leave_requests WHERE id = {A.leave}$$, 1);
SELECT sec_test.sees('A.team_leader', 'cannot see leave of another team (team A vs team B)', $$SELECT 1 FROM leave_requests WHERE id = {A.leave_tl2}$$, 0);
SELECT sec_test.sees('A.team_leader2', 'sees leave of own team', $$SELECT 1 FROM leave_requests WHERE id = {A.leave_tl2}$$, 1);
SELECT sec_test.sees('A.team_leader2', 'cannot see leave of another team (team B vs team A)', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl_own})$$, 0);
SELECT sec_test.sees('A.team_leader', 'cannot see leave of other people of the orchard', $$SELECT 1 FROM leave_requests WHERE id = {A.leave_runner}$$, 0);
SELECT sec_test.sees('A.team_leader', 'cannot see leave of another orchard', $$SELECT 1 FROM leave_requests WHERE id = {B.leave}$$, 0);
SELECT sec_test.sees('A.team_leader', 'sees own leave', $$SELECT 1 FROM leave_requests WHERE id = {A.leave_tl_own}$$, 1);
SELECT sec_test.sees('A.runner', 'sees own leave', $$SELECT 1 FROM leave_requests WHERE id = {A.leave_runner}$$, 1);
SELECT sec_test.sees('A.runner', 'sees only own leave', $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl2}, {A.leave_tl_own})$$, 0);
SELECT sec_test.sees(w, 'cannot read leave of others (uses presence_today)',
    $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl2}, {A.leave_tl_own}, {A.leave_runner})$$, 0)
FROM unnest(ARRAY['A.qc_inspector', 'A.logistics']) AS w;
SELECT sec_test.sees('A.manager', 'sees every leave of own orchard',
    $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl2}, {A.leave_tl_own}, {A.leave_runner})$$, 4);
SELECT sec_test.sees(w, 'sees every leave of the company',
    $$SELECT 1 FROM leave_requests WHERE id IN ({A.leave}, {A.leave_tl2}, {A.leave_tl_own}, {A.leave_runner}, {B.leave})$$, 5)
FROM unnest(ARRAY['A.hr_admin', 'A.payroll_admin', 'A.admin']) AS w;
SELECT sec_test.sees('A.inactive_manager', 'deactivated account sees no leave', $$SELECT 1 FROM leave_requests$$, 0);
-- Pedir para su equipo sigue igual (y la app recibe la fila: INSERT … RETURNING)
SELECT sec_test.allow('A.team_leader', 'still requests leave for own team and gets the row back',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker}, 'day_off', current_date + 9, current_date + 9, auth.uid()) RETURNING id$$);
SELECT sec_test.deny('A.team_leader', 'still cannot request leave for another team',
    $$INSERT INTO leave_requests (orchard_id, picker_id, type, start_date, end_date, requested_by)
      VALUES ({A}, {A.picker_tl2}, 'day_off', current_date + 9, current_date + 9, auth.uid())$$);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Inspecciones de calidad, bienestar y fotos
-- ═════════════════════════════════════════════════════════════════════════════
SELECT sec_test.sees('A.team_leader', 'sees QC of own team', $$SELECT 1 FROM qc_inspections WHERE id IN ({A.qc}, {A.qc_other})$$, 2);
SELECT sec_test.sees('A.team_leader', 'cannot see QC of another team (team A vs team B)', $$SELECT 1 FROM qc_inspections WHERE id = {A.qc_tl2}$$, 0);
SELECT sec_test.sees('A.team_leader', 'cannot see wellbeing notes of another team',
    $$SELECT wellbeing_notes FROM qc_inspections WHERE wellbeing_notes IS NOT NULL$$, 0);
SELECT sec_test.sees('A.team_leader2', 'sees QC and wellbeing of own team',
    $$SELECT 1 FROM qc_inspections WHERE id = {A.qc_tl2} AND wellbeing_notes = 'SecTest wellbeing note'$$, 1);
SELECT sec_test.sees('A.team_leader2', 'cannot see QC of another team (team B vs team A)', $$SELECT 1 FROM qc_inspections WHERE id IN ({A.qc}, {A.qc_other})$$, 0);
SELECT sec_test.sees('A.team_leader', 'cannot see QC of another orchard', $$SELECT 1 FROM qc_inspections WHERE id = {B.qc}$$, 0);
SELECT sec_test.sees(w, 'cannot read QC inspections', $$SELECT 1 FROM qc_inspections$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.logistics', 'A.payroll_admin', 'B.runner', 'B.logistics', 'B.payroll_admin',
                  'A.inactive_manager', 'A.manager@aal1']) AS w;
SELECT sec_test.sees('A.manager', 'sees every QC of own orchard', $$SELECT 1 FROM qc_inspections WHERE id IN ({A.qc}, {A.qc_tl2}, {A.qc_other})$$, 3);
SELECT sec_test.sees('A.manager', 'cannot see QC of another orchard', $$SELECT 1 FROM qc_inspections WHERE id = {B.qc}$$, 0);
SELECT sec_test.sees(w, 'sees every QC of the company', $$SELECT 1 FROM qc_inspections WHERE id IN ({A.qc}, {A.qc_tl2}, {A.qc_other}, {B.qc})$$, 4)
FROM unnest(ARRAY['A.hr_admin', 'A.admin']) AS w;
-- El inspector: crea, recibe la fila y ve solo las suyas
SELECT sec_test.sees('A.qc_inspector', 'sees the inspections they created', $$SELECT 1 FROM qc_inspections WHERE id IN ({A.qc}, {A.qc_tl2})$$, 2);
SELECT sec_test.sees('A.qc_inspector', 'cannot see inspections of another inspector', $$SELECT 1 FROM qc_inspections WHERE id = {A.qc_other}$$, 0);
SELECT sec_test.sees('A.qc_inspector2', 'sees only own inspections', $$SELECT 1 FROM qc_inspections WHERE orchard_id = {A}$$, 1);
SELECT sec_test.allow('A.qc_inspector', 'creates an inspection and gets the row back (QC screen)',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade, wellbeing_notes)
      VALUES ({A}, {A.picker_tl2}, auth.uid(), 'B', 'ok') RETURNING id$$);
SELECT sec_test.deny('A.qc_inspector', 'cannot create an inspection in the name of another inspector',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade) VALUES ({A}, {A.picker}, {A.qc_inspector2}, 'B')$$);
SELECT sec_test.deny('A.qc_inspector', 'cannot change an inspection', $$UPDATE qc_inspections SET grade = 'A' WHERE id = {A.qc}$$);
SELECT sec_test.deny('A.qc_inspector', 'cannot delete an inspection', $$DELETE FROM qc_inspections WHERE id = {A.qc}$$);
SELECT sec_test.deny(w, 'cannot create QC inspections',
    $$INSERT INTO qc_inspections (orchard_id, picker_id, inspector_id, grade) VALUES ({A}, {A.picker}, auth.uid(), 'B')$$)
FROM unnest(ARRAY['A.team_leader', 'A.runner', 'A.logistics', 'A.payroll_admin', 'A.hr_admin']) AS w;
SELECT sec_test.allow('A.manager', 'manager corrects an inspection of own orchard', $$UPDATE qc_inspections SET grade = 'B' WHERE id = {A.qc_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'team leader cannot change an inspection', $$UPDATE qc_inspections SET grade = 'A' WHERE id = {A.qc}$$);

-- Fotos (la ruta va en qc_inspections.photo_url)
SELECT sec_test.sees('A.team_leader', 'sees the QC photo of own team', $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {A.qc_photo_other})$$, 2);
SELECT sec_test.sees('A.team_leader', 'cannot see the QC photo of another team', $$SELECT 1 FROM storage.objects WHERE id = {A.qc_photo_tl2}$$, 0);
SELECT sec_test.sees('A.team_leader2', 'sees only the QC photo of own team',
    $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {A.qc_photo_tl2}, {A.qc_photo_other})$$, 1);
SELECT sec_test.sees('A.qc_inspector', 'sees the photos they uploaded only',
    $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {A.qc_photo_tl2}, {A.qc_photo_other})$$, 2);
SELECT sec_test.sees(w, 'sees every QC photo of the orchard',
    $$SELECT 1 FROM storage.objects WHERE id IN ({A.qc_photo}, {A.qc_photo_tl2}, {A.qc_photo_other})$$, 3)
FROM unnest(ARRAY['A.manager', 'A.hr_admin', 'A.admin', 'B.hr_admin']) AS w;
SELECT sec_test.sees(w, 'cannot see QC photos', $$SELECT 1 FROM storage.objects WHERE bucket_id = 'qc-photos'$$, 0)
FROM unnest(ARRAY['anon', 'A.runner', 'A.logistics', 'A.payroll_admin', 'B.team_leader', 'B.manager']) AS w;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Filas
-- ═════════════════════════════════════════════════════════════════════════════
-- El manager asigna (también dos por delante de una vez) y retira
SELECT sec_test.allow('A.manager', 'manager assigns two rows ahead to a team',
    $$INSERT INTO row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id)
      VALUES ({A}, 7, ARRAY[{A.picker}], {A.team_leader}), ({A}, 8, ARRAY[{A.picker}], {A.team_leader})$$, 2);
SELECT sec_test.allow('A.manager', 'manager moves a team off a row', $$UPDATE row_assignments SET status = 'moved', ended_at = now() WHERE id = {A.rowasg}$$);
SELECT sec_test.allow('A.manager', 'manager reassigns a row to another team', $$UPDATE row_assignments SET team_leader_id = {A.team_leader2} WHERE id = {A.rowasg_ahead}$$);
SELECT sec_test.allow('A.manager', 'manager places a picker in any row', $$UPDATE pickers SET current_row = 9 WHERE id = {A.picker}$$);
SELECT sec_test.deny('B.manager', 'cannot assign rows in another orchard',
    $$INSERT INTO row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id) VALUES ({A}, 9, ARRAY[{A.picker}], {A.team_leader})$$);

-- El team leader mueve a SU equipo entre las filas asignadas
SELECT sec_test.allow('A.team_leader', 'moves own team to a row the manager assigned (ahead)', $$UPDATE pickers SET current_row = 2 WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.team_leader', 'moves own team back to the first assigned row', $$UPDATE pickers SET current_row = 1 WHERE id = {A.picker}$$);
SELECT sec_test.allow('A.team_leader', 'takes own team off rows', $$UPDATE pickers SET current_row = 0 WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot move own team to a row the manager did not assign', $$UPDATE pickers SET current_row = 5 WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot move own team to a row assigned to another team', $$UPDATE pickers SET current_row = 3 WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot move own team to a row already completed', $$UPDATE pickers SET current_row = 4 WHERE id = {A.picker}$$);
SELECT sec_test.deny('A.team_leader', 'cannot move a picker of another team', $$UPDATE pickers SET current_row = 3 WHERE id = {A.picker_tl2}$$);
SELECT sec_test.allow('A.team_leader2', 'the other team leader moves his team to his row', $$UPDATE pickers SET current_row = 3 WHERE id = {A.picker_tl2}$$);

-- Avance y fin de sus filas, nada más
SELECT sec_test.allow('A.team_leader', 'records progress on own team row', $$UPDATE row_assignments SET completion_percentage = 40 WHERE id = {A.rowasg}$$);
SELECT sec_test.allow('A.team_leader', 'completes own team row', $$UPDATE row_assignments SET completion_percentage = 100, status = 'completed', ended_at = now() WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot assign rows', $$INSERT INTO row_assignments (orchard_id, row_number, assigned_pickers, team_leader_id) VALUES ({A}, 5, ARRAY[{A.picker}], auth.uid())$$);
SELECT sec_test.deny('A.team_leader', 'cannot change the row number of an assignment', $$UPDATE row_assignments SET row_number = 5 WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot hand own row to another team', $$UPDATE row_assignments SET team_leader_id = {A.team_leader2} WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot change who is assigned to a row', $$UPDATE row_assignments SET assigned_pickers = ARRAY[{A.picker_tl2}] WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot retire a row (manager decides)', $$UPDATE row_assignments SET status = 'moved', ended_at = now() WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot soft-delete a row assignment', $$UPDATE row_assignments SET deleted_at = now() WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot delete own row assignment', $$DELETE FROM row_assignments WHERE id = {A.rowasg}$$);
SELECT sec_test.deny('A.team_leader', 'cannot touch another team''s row', $$UPDATE row_assignments SET completion_percentage = 90 WHERE id = {A.rowasg_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot delete another team''s row', $$DELETE FROM row_assignments WHERE id = {A.rowasg_tl2}$$);
SELECT sec_test.deny('A.team_leader', 'cannot take another team''s row', $$UPDATE row_assignments SET team_leader_id = auth.uid() WHERE id = {A.rowasg_tl2}$$);
SELECT sec_test.deny(w, 'cannot assign or change rows',
    $$UPDATE row_assignments SET completion_percentage = 10 WHERE id = {A.rowasg}$$)
FROM unnest(ARRAY['A.runner', 'A.qc_inspector', 'A.logistics', 'A.hr_admin', 'A.payroll_admin', 'B.team_leader']) AS w;

SELECT sec_test.finish();
ROLLBACK;
