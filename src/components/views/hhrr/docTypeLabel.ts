/** Tipo de documento de RRHH en el idioma de la app */
import type { TFunction } from '@/i18n';
import { HR_DOCUMENT_TYPE_LABELS } from '@/repositories/hr-documents.repository';

export function docTypeLabel(t: TFunction, type: string): string {
    const key = `hrdoc.type.${type}`;
    const out = t(key);
    return out === key ? (HR_DOCUMENT_TYPE_LABELS as Record<string, string>)[type] ?? type : out;
}
