import type { GradeDistribution } from './qc.service';

/** Reparto de notas A/B/C/reject de unas inspecciones (sin volver a pedirlas) */
export function distributionOf(inspections: readonly { grade: string }[]): GradeDistribution {
    const dist: GradeDistribution = { A: 0, B: 0, C: 0, reject: 0, total: 0 };
    for (const insp of inspections) {
        if (insp.grade in dist && insp.grade !== 'total') {
            dist[insp.grade as keyof Omit<GradeDistribution, 'total'>]++;
        }
        dist.total++;
    }
    return dist;
}
