-- =============================================================================
-- Endurecimiento de seguridad (auditoría externa 2026-10-16, hallazgos 10, 11, 14)
-- (prueba: supabase/tests/security/90_hardening_2.sql)
-- =============================================================================

-- ── 1) Bloqueo de cuentas: fuera ──────────────────────────────────────────────
-- Cualquiera (incluso sin sesión) podía insertar intentos fallidos y el
-- disparador bloqueaba la cuenta de otra persona. El bloqueo solo lo miraba
-- la app (Supabase Auth no), así que no protegía contra fuerza bruta y era una
-- forma de molestar. La app ya no registra intentos ni consulta el bloqueo;
-- la protección real son los límites de intentos de Supabase Auth.
-- Las tablas se conservan (historial); solo se cierra la escritura.
DROP TRIGGER IF EXISTS trigger_lock_account ON public.login_attempts;
DROP POLICY IF EXISTS "anyone_can_insert_login_attempts" ON public.login_attempts;
REVOKE INSERT ON public.login_attempts FROM anon, authenticated;
UPDATE public.account_locks SET unlocked_at = now() WHERE unlocked_at IS NULL;

-- is_account_locked: ya no hay bloqueos de la app; siempre false (la firma se
-- mantiene por si un cliente antiguo la llama)
CREATE OR REPLACE FUNCTION public.is_account_locked(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT false $$;

-- ── 2) Documentos de RRHH (pasaportes, visados, contratos firmados) ──────────
-- El manager ve la lista (avisos de visados que caducan) pero no abre, sube
-- ni borra los ficheros. Gestionar documentos: RRHH y admin.
DROP POLICY IF EXISTS "hr_documents_hr_manage" ON public.hr_documents;
CREATE POLICY "hr_documents_hr_manage" ON public.hr_documents
    FOR ALL TO authenticated
    USING (public.is_role(ARRAY['hr_admin', 'admin']))
    WITH CHECK (public.is_role(ARRAY['hr_admin', 'admin']));

DROP POLICY IF EXISTS "hr_documents_manager_list" ON public.hr_documents;
CREATE POLICY "hr_documents_manager_list" ON public.hr_documents
    FOR SELECT TO authenticated
    USING (public.is_role(ARRAY['manager']));

DROP POLICY IF EXISTS "HR documents read" ON storage.objects;
CREATE POLICY "HR documents read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));

DROP POLICY IF EXISTS "HR documents upload" ON storage.objects;
CREATE POLICY "HR documents upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));

DROP POLICY IF EXISTS "HR documents update" ON storage.objects;
CREATE POLICY "HR documents update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']))
    WITH CHECK (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));

DROP POLICY IF EXISTS "HR documents delete" ON storage.objects;
CREATE POLICY "HR documents delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'hr-documents' AND public.is_role(ARRAY['hr_admin', 'admin']));

-- ── 3) Fotos de QC: privadas ──────────────────────────────────────────────────
-- El bucket era público: cualquiera con el enlace veía las fotos. Ahora solo
-- las ven QC, manager y admin, con enlaces firmados que caducan (useQcPhotoUrl).
UPDATE storage.buckets SET public = false WHERE id = 'qc-photos';

DROP POLICY IF EXISTS "Public can view QC photos" ON storage.objects;
DROP POLICY IF EXISTS "QC staff view QC photos" ON storage.objects;
CREATE POLICY "QC staff view QC photos" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'qc-photos' AND public.is_role(ARRAY['qc_inspector', 'manager', 'admin']));
