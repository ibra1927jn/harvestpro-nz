import { nowNZST } from '@/utils/nzst';
import { MAX_BUCKETS_PER_BIN, type Bin } from '@/types/app.types';
import { binRepository } from '@/repositories/bin.repository';
import { logger } from '@/utils/logger';
import { syncService } from './sync.service';

type DbBinStatus = 'empty' | 'partial' | 'full' | 'collected';

/** En la BD el bin a medio llenar es 'partial'; en la app, 'in-progress' */
const toApp = (s: string): Bin['status'] =>
    s === 'partial' ? 'in-progress' : (['empty', 'in-progress', 'full', 'collected'].includes(s) ? s as Bin['status'] : 'empty');
const toDb = (s: Bin['status']): DbBinStatus => (s === 'in-progress' ? 'partial' : s);

/** Cubetas metidas en un bin: las del móvil (aún sin subir) + las ya guardadas, sin contar dos veces */
export function bucketsInBin(
    binId: string | undefined,
    localBuckets: Array<{ id: string; bin_id?: string | null }>,
    records: Array<{ id: string; bin_id?: string | null }>
): number {
    if (!binId) return 0;
    const ids = new Set<string>();
    for (const b of localBuckets) if (b.bin_id === binId) ids.add(b.id);
    for (const r of records) if (r.bin_id === binId) ids.add(r.id);
    return ids.size;
}

export const binService = {
    async getBins(orchardId: string): Promise<Bin[]> {
        const data = await binRepository.getByOrchard(orchardId);

        return (data || [])
            .filter(b => !(b as Record<string, unknown>).deleted_at)
            .map(b => ({
                id: b.id,
                status: toApp(b.status),
                fillPercentage: 0, // se calcula con las cubetas del bin
                type: ((b as Record<string, unknown>).variety as Bin['type']) || 'Standard',
                bin_code: b.bin_code,
                sunExposureStart: (b as Record<string, unknown>).filled_at
                    ? new Date((b as Record<string, unknown>).filled_at as string).getTime()
                    : undefined,
            }));
    },

    /**
     * Cambio de estado de un bin (lleno, recogido…). Va por la cola offline:
     * sin cobertura no se pierde y sale al volver la red, con la hora en que se
     * hizo (filled_at). Antes iba directo y sin red se perdía.
     */
    async updateBinStatus(binId: string, status: Bin['status']): Promise<void> {
        await syncService.addToQueue('BIN', {
            action: 'status',
            bin_id: binId,
            status: toDb(status),
            filled_at: status === 'full' ? nowNZST() : null,
        });
    },

    /**
     * Bin escaneado que aún no está en el sistema: se da de alta ya en uso.
     * El id se crea en el móvil, así que las cubetas pueden apuntar a él aunque
     * no haya conexión (bucket_records.bin_id no exige que exista), y el alta va
     * por la cola offline: reintentarla no crea otro bin.
     */
    async registerBin(orchardId: string, binCode: string): Promise<Bin> {
        const bin: Bin = {
            id: crypto.randomUUID(),
            status: 'in-progress',
            fillPercentage: 0,
            type: 'Standard',
            bin_code: binCode,
        };
        try {
            await syncService.addToQueue('BIN', {
                action: 'register',
                bin_id: bin.id,
                orchard_id: orchardId,
                bin_code: binCode,
                status: 'partial',
            });
        } catch (e) {
            logger.warn('[Bins] Could not queue the new bin (stays on screen only):', e);
        }
        return bin;
    },

    MAX_BUCKETS_PER_BIN,
};
