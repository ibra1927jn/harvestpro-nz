-- =============================================
-- SEED 00: Bootstrap para desarrollo LOCAL
-- Crea el orchard "Sunrise Apple Orchard" y los 8 usuarios de rol con los
-- UUIDs fijos que esperan seed_2weeks_local, seed_role_users y seed_today_local.
-- Solo para `supabase start` local. Password de todos: 111111
-- Orden: 00_bootstrap -> 2weeks_local -> role_users -> today_local
-- =============================================

DO $$
BEGIN
  IF current_database() <> 'postgres' OR current_setting('server_version_num')::int < 0 THEN
    RAISE EXCEPTION 'solo para local';
  END IF;
END $$;

-- Orchard
INSERT INTO public.orchards (id, code, name, location, total_blocks, total_rows)
VALUES ('e1337e6a-54cc-431c-9c00-980e8ea270a4', 'SUNRISE', 'Sunrise Apple Orchard', 'Hawke''s Bay, NZ', 2, 27)
ON CONFLICT (id) DO NOTHING;

-- Auth users (insert directo: solo valido en local)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('ca4d4673-321b-47bf-883b-4cf897f71a0e','manager@harvestpro.nz',  crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('e22c3c09-0e79-449f-b32a-235a61ea0ace','lead@harvestpro.nz',     crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('1e5f0893-0d09-4035-8e03-d68305811820','runner@harvestpro.nz',   crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('97999f3b-681f-42db-bcde-a75e85f58cae','qc@harvestpro.nz',       crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('1198096f-226a-4cfa-93c2-d04410a07555','payroll@harvestpro.nz',  crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('e85845ec-d181-43a1-a51b-0549a258c54d','admin@harvestpro.nz',    crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('e5b1772c-f120-413f-abac-d23efc1f0063','hr@harvestpro.nz',       crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW()),
  ('f7407467-cd7f-4786-911f-6dee3b8cfe9f','logistics@harvestpro.nz',crypt('111111',gen_salt('bf')), NOW(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}','{}',NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

-- Manager en public.users (los otros 7 los inserta seed_role_users)
INSERT INTO public.users (id, email, full_name, role, orchard_id, is_active)
VALUES ('ca4d4673-321b-47bf-883b-4cf897f71a0e','manager@harvestpro.nz','Orchard Manager','manager','e1337e6a-54cc-431c-9c00-980e8ea270a4',true)
ON CONFLICT (id) DO NOTHING;

-- GoTrue no tolera NULL en columnas de token ni usuarios sin identity
UPDATE auth.users SET confirmation_token=COALESCE(confirmation_token,''), recovery_token=COALESCE(recovery_token,''), email_change=COALESCE(email_change,''), email_change_token_new=COALESCE(email_change_token_new,''), email_change_token_current=COALESCE(email_change_token_current,''), phone_change=COALESCE(phone_change,''), phone_change_token=COALESCE(phone_change_token,''), reauthentication_token=COALESCE(reauthentication_token,''), is_sso_user=COALESCE(is_sso_user,false), is_anonymous=COALESCE(is_anonymous,false);
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true), now(), now(), now()
FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id);
