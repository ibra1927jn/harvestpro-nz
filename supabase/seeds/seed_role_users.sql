-- =============================================
-- SEED: Usuarios de rol para desarrollo local
-- Crea los 7 roles faltantes en el orchard Sunrise Apple Orchard
-- Contraseña: 111111 para todos
--
-- ⚠️  PRODUCCIÓN GUARD: NO correr en prod (contraseñas triviales)
-- =============================================

DO $$
BEGIN
  IF current_database() ILIKE '%prod%' OR current_database() ILIKE '%production%' THEN
    RAISE EXCEPTION '🚫 BLOCKED: contraseñas triviales — no ejecutar en producción.';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- MÉTODO RECOMENDADO: API admin (más rápido que bcrypt directo en la CLI)
--
-- Ejecutar en bash:
--   SECRET=$(npx supabase status | grep "service_role key" | awk '{print $NF}')
--   for email in lead runner qc payroll admin hr logistics; do
--     curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
--       -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
--       -H "Content-Type: application/json" \
--       -d "{\"email\":\"${email}@harvestpro.nz\",\"password\":\"111111\",\"email_confirm\":true}"
--   done
--
-- IDs creados el 2026-04-17 en local:
--   lead@harvestpro.nz       → e22c3c09-0e79-449f-b32a-235a61ea0ace
--   runner@harvestpro.nz     → 1e5f0893-0d09-4035-8e03-d68305811820
--   qc@harvestpro.nz         → 97999f3b-681f-42db-bcde-a75e85f58cae
--   payroll@harvestpro.nz    → 1198096f-226a-4cfa-93c2-d04410a07555
--   admin@harvestpro.nz      → e85845ec-d181-43a1-a51b-0549a258c54d
--   hr@harvestpro.nz         → e5b1772c-f120-413f-abac-d23efc1f0063
--   logistics@harvestpro.nz  → f7407467-cd7f-4786-911f-6dee3b8cfe9f
-- ──────────────────────────────────────────────────────────────────────────

-- Si se hace db reset y se regeneran IDs, usar el script bash arriba
-- y luego insertar en public.users y public.pickers con los nuevos IDs.

INSERT INTO public.users (id, email, full_name, role, orchard_id, is_active)
VALUES
  ('e22c3c09-0e79-449f-b32a-235a61ea0ace','lead@harvestpro.nz',      'Team Leader',       'team_leader',   'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('1e5f0893-0d09-4035-8e03-d68305811820','runner@harvestpro.nz',    'Bucket Runner',     'runner',        'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('97999f3b-681f-42db-bcde-a75e85f58cae','qc@harvestpro.nz',        'QC Inspector',      'qc_inspector',  'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('1198096f-226a-4cfa-93c2-d04410a07555','payroll@harvestpro.nz',   'Payroll Admin',     'payroll_admin', 'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('e85845ec-d181-43a1-a51b-0549a258c54d','admin@harvestpro.nz',     'System Admin',      'admin',         'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('e5b1772c-f120-413f-abac-d23efc1f0063','hr@harvestpro.nz',        'HR Admin',          'hr_admin',      'e1337e6a-54cc-431c-9c00-980e8ea270a4',true),
  ('f7407467-cd7f-4786-911f-6dee3b8cfe9f','logistics@harvestpro.nz', 'Logistics Manager', 'logistics',     'e1337e6a-54cc-431c-9c00-980e8ea270a4',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pickers (id, picker_id, name, orchard_id, role, safety_verified, status)
VALUES
  ('e22c3c09-0e79-449f-b32a-235a61ea0ace','LEAD-001','Team Leader',   'e1337e6a-54cc-431c-9c00-980e8ea270a4','team_leader',true,'active'),
  ('1e5f0893-0d09-4035-8e03-d68305811820','RUN-001', 'Bucket Runner', 'e1337e6a-54cc-431c-9c00-980e8ea270a4','runner',     true,'active')
ON CONFLICT (picker_id) DO NOTHING;

-- Verificar resultado
SELECT u.email, u.role, u.full_name,
       au.email_confirmed_at IS NOT NULL AS confirmed
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE u.email LIKE '%@harvestpro.nz'
  AND u.email != 'manager@harvestpro.nz'
ORDER BY u.role;

-- Las Edge Functions autorizan con el rol del token (user_metadata.role), no con
-- public.users.role. Copiarlo aquí evita el 403 "Got: none" en local.
-- (Pendiente: una sola fuente de rol — fase 4 del plan.)
UPDATE auth.users a
SET raw_user_meta_data = COALESCE(a.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', u.role)
FROM public.users u
WHERE u.id = a.id AND u.role IS NOT NULL;
