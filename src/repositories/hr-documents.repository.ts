/**
 * HR Documents Repository — thin wrapper sobre supabase.
 * Gestiona hr_documents table + hr-documents storage bucket.
 */
import { supabase } from '@/services/supabase';
import { addDaysYMD, todayNZST } from '@/utils/nzst';
import { fetchAllRows } from '@/utils/fetchAllRows';

export type HRDocumentType =
  | 'employment_agreement'
  | 'work_visa'
  | 'health_safety_cert'
  | 'tax_declaration'
  | 'rse_induction'
  | 'pastoral_care_plan'
  | 'passport'
  | 'driver_license'
  | 'other';

export interface HRDocumentRow {
  id: string;
  orchard_id: string;
  picker_id: string | null;
  user_id: string | null;
  document_type: HRDocumentType;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  expires_at: string | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  deleted_at: string | null;
  /** Contrato del que es copia firmada (employment_agreement); null = documento suelto */
  contract_id: string | null;
}

/** Lo que RRHH necesita de cada documento para la ficha (sin título ni notas) */
export type PersonDocumentRow = Pick<
  HRDocumentRow,
  'id' | 'picker_id' | 'user_id' | 'document_type' | 'expires_at' | 'contract_id' | 'storage_path'
>;

const BUCKET = 'hr-documents';
/** Tamaño máximo de un documento de RRHH (10 MB); la pantalla lo comprueba antes de subir */
export const HR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILE_SIZE_BYTES = HR_DOCUMENT_MAX_BYTES;

export const hrDocumentsRepository = {
  /** List non-deleted docs for an orchard, newest first. */
  async listByOrchard(orchardId: string): Promise<HRDocumentRow[]> {
    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .eq('orchard_id', orchardId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },

  /** Todos los documentos de la empresa, más nuevos primero */
  async listAll(): Promise<HRDocumentRow[]> {
    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },

  /** Docs for a specific picker (includes expired). */
  async listByPicker(pickerId: string): Promise<HRDocumentRow[]> {
    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .eq('picker_id', pickerId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },

  /**
   * Documentos de una persona: los de plantilla van por picker_id y los de
   * cuentas de oficina por user_id (ficha de RRHH › Employees).
   */
  async listByPerson(personId: string): Promise<HRDocumentRow[]> {
    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .or(`picker_id.eq.${personId},user_id.eq.${personId}`)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },

  /** Upload a file to the private bucket and create the DB row. */
  async upload(
    file: File,
    meta: {
      orchardId: string;
      pickerId?: string | null;
      userId?: string | null;
      documentType: HRDocumentType;
      title: string;
      expiresAt?: string | null;
      notes?: string | null;
      uploadedBy?: string | null;
      /** Copia firmada de este contrato (document_type employment_agreement) */
      contractId?: string | null;
    },
  ): Promise<HRDocumentRow> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Archivo demasiado grande (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`);
    }
    if (!meta.pickerId && !meta.userId) {
      throw new Error('picker_id o user_id requerido');
    }
    const storagePath = `${meta.orchardId}/${meta.documentType}/${Date.now()}-${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) throw uploadErr;

    const { data, error: insertErr } = await supabase
      .from('hr_documents')
      .insert({
        orchard_id: meta.orchardId,
        picker_id: meta.pickerId ?? null,
        user_id: meta.userId ?? null,
        document_type: meta.documentType,
        title: meta.title,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        expires_at: meta.expiresAt ?? null,
        notes: meta.notes ?? null,
        uploaded_by: meta.uploadedBy ?? null,
        contract_id: meta.contractId ?? null,
      })
      .select()
      .single();

    if (insertErr) {
      // Rollback: remove uploaded file
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw insertErr;
    }
    return data as HRDocumentRow;
  },

  /** Soft-delete + remove from storage. */
  async softDelete(documentId: string, storagePath: string): Promise<void> {
    const { error: updateErr } = await supabase
      .from('hr_documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', documentId);
    if (updateErr) throw updateErr;

    // Best-effort storage cleanup (don't fail if storage errors)
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  },

  /** Get a signed URL for downloading (private bucket). */
  async getSignedUrl(storagePath: string, expiresInSec = 300): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  },

  /**
   * Documentos de toda la empresa, versión ligera, para la ficha de RRHH:
   * visado (estado), copia firmada del contrato (contract_id) y el resto de
   * documentos obligatorios. Con 450 personas y varios documentos por cabeza
   * pasa de 1000 filas: se lee por páginas con orden estable.
   */
  async listPersonDocuments(): Promise<PersonDocumentRow[]> {
    return fetchAllRows<PersonDocumentRow>((from, to) => supabase
      .from('hr_documents')
      .select('id, picker_id, user_id, document_type, expires_at, contract_id, storage_path')
      .is('deleted_at', null)
      .order('id')
      .range(from, to));
  },

  /** Documentos de toda la empresa caducados o que caducan en N días */
  async listExpiringCompany(daysAhead = 30): Promise<HRDocumentRow[]> {
    const cutoff = new Date(Date.now() + daysAhead * 86400000)
      .toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .is('deleted_at', null)
      .not('expires_at', 'is', null)
      .lte('expires_at', cutoff)
      .order('expires_at', { ascending: true });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },

  /** Docs expiring in the next N days across an orchard. */
  async listExpiringSoon(orchardId: string, daysAhead = 60): Promise<HRDocumentRow[]> {
    const cutoffIso = addDaysYMD(todayNZST(), daysAhead);

    const { data, error } = await supabase
      .from('hr_documents')
      .select('*')
      .eq('orchard_id', orchardId)
      .is('deleted_at', null)
      .not('expires_at', 'is', null)
      .lte('expires_at', cutoffIso)
      .order('expires_at', { ascending: true });
    if (error) throw error;
    return (data || []) as HRDocumentRow[];
  },
};

export const HR_DOCUMENT_TYPE_LABELS: Record<HRDocumentType, string> = {
  employment_agreement: 'Employment Agreement',
  work_visa: 'Work Visa',
  health_safety_cert: 'Health & Safety Certificate',
  tax_declaration: 'Tax Declaration',
  rse_induction: 'RSE Worker Induction',
  pastoral_care_plan: 'Pastoral Care Plan',
  passport: 'Passport',
  driver_license: 'Driver License',
  other: 'Other',
};
