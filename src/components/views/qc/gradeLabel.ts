/** Nombre del grado de calidad en el idioma de la app */
import type { TFunction } from '@/i18n';

export type QCGrade = 'A' | 'B' | 'C' | 'reject';

const KEYS: Record<QCGrade, string> = {
    A: 'panel.quality.grade_a',
    B: 'panel.quality.grade_b',
    C: 'panel.quality.grade_c',
    reject: 'qc.reject',
};

export function gradeLabel(t: TFunction, grade: QCGrade): string {
    return t(KEYS[grade]);
}
