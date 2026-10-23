-- =============================================================================
-- RRHH: copia firmada del contrato enlazada al contrato (revisión 21-10, #17)
--
-- La ley (Employment Relations Act 2000, s.64) obliga a tener copia del
-- acuerdo de empleo de cada persona. La tabla hr_documents ya guardaba PDFs
-- de tipo employment_agreement, pero sin enlace con la fila de contracts: no
-- se podía saber qué contrato tenía copia firmada y cuál no.
--
-- Columna nueva: hr_documents.contract_id → contracts(id). Al borrar el
-- contrato el documento se queda (SET NULL): sigue siendo un documento de la
-- persona. Un contrato sin documento employment_agreement enlazado cuenta como
-- "pendiente" en el resumen de RRHH.
-- =============================================================================

ALTER TABLE public.hr_documents
    ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hr_documents_contract
    ON public.hr_documents(contract_id)
    WHERE deleted_at IS NULL AND contract_id IS NOT NULL;

COMMENT ON COLUMN public.hr_documents.contract_id IS
  'Contrato (contracts.id) del que este documento es la copia firmada (document_type = employment_agreement). NULL = documento suelto de la persona.';
