-- ============================================================================
-- HR Documents — upload/storage integration (previously stub in DocumentsTab)
-- Added 2026-04-18 as part of HHRR flow completion.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchard_id UUID NOT NULL REFERENCES public.orchards(id) ON DELETE CASCADE,
  picker_id UUID REFERENCES public.pickers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'employment_agreement', 'work_visa', 'health_safety_cert',
    'tax_declaration', 'rse_induction', 'pastoral_care_plan',
    'passport', 'driver_license', 'other'
  )),
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  expires_at DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT hr_documents_target_check CHECK (picker_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_orchard ON public.hr_documents(orchard_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_picker ON public.hr_documents(picker_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_user ON public.hr_documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_expiring ON public.hr_documents(expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_documents_hr_manage ON public.hr_documents;
CREATE POLICY hr_documents_hr_manage ON public.hr_documents
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('hr_admin','admin','manager')));

DROP POLICY IF EXISTS hr_documents_self_read ON public.hr_documents;
CREATE POLICY hr_documents_self_read ON public.hr_documents FOR SELECT
  USING (user_id = auth.uid());

-- Private storage bucket for HR documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('hr-documents', 'hr-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: HR/admin/manager full access
-- storage.objects pertenece a supabase_storage_admin; en CLI local las migraciones no son owner.
-- Se intenta como ese rol y, si no hay permiso, se avisa en vez de abortar (aplicar via Studio en ese caso).
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE supabase_storage_admin;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  DROP POLICY IF EXISTS "hr_docs_hr_manage" ON storage.objects;
  CREATE POLICY "hr_docs_hr_manage" ON storage.objects
    USING (bucket_id = 'hr-documents' AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('hr_admin','admin','manager')));
  RESET ROLE;
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  RAISE NOTICE 'hr_docs_hr_manage: sin permiso sobre storage.objects, crear la policy desde Studio';
END $$;

COMMENT ON TABLE public.hr_documents IS 'HR document uploads: contracts, visas, certs. Private storage bucket "hr-documents". RLS: hr_admin/admin/manager full, user self-read.';
