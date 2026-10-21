/**
 * Nombre de la nota de la inspección de un picker en el idioma de la app.
 *
 * A/B/C/reject son notas de CÓMO RECOGE la persona (Bien / Aceptable / A
 * corregir / Grave), no calidades de fruta: «exportación / nacional / proceso»
 * son de la cubeta (QualityRatingModal) y no se usan aquí.
 */
import type { TFunction } from '@/i18n';

export type QCGrade = 'A' | 'B' | 'C' | 'reject';

const KEYS: Record<QCGrade, string> = {
    A: 'qc.grade_good',
    B: 'qc.grade_acceptable',
    C: 'qc.grade_fix',
    reject: 'qc.grade_severe',
};

/** Etiqueta corta: Bien / Aceptable / A corregir / Grave */
export function gradeLabel(t: TFunction, grade: QCGrade): string {
    return t(KEYS[grade]);
}

/** Letra que se enseña en las píldoras: A, B, C o «RECH» */
export function gradeLetter(t: TFunction, grade: QCGrade): string {
    return grade === 'reject' ? t('qc.rej') : grade;
}

/** Etiqueta completa para avisos y lectores de pantalla: «Grade A (Good)» */
export function gradeLongLabel(t: TFunction, grade: QCGrade): string {
    return t('qc.grade_long', { grade: grade === 'reject' ? t('qc.reject') : grade, label: gradeLabel(t, grade) });
}
