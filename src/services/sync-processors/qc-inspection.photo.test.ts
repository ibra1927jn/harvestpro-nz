/**
 * Foto de QC sin cobertura (auditoría 2026-10-23): la foto espera en el móvil
 * con la inspección; la cola la sube y después guarda la inspección (mismo id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { qcRepository } from '@/repositories/qc.repository';
import { db } from '../db';
import { pendingFiles } from '../pending-uploads.service';
import { processQCInspection } from './qc-inspection.processor';
import * as schemas from '../sync.schemas';

const ID = '0f5e2c1a-1111-4222-8333-944455556666';
const ORCH = 'e1337e6a-54cc-431c-9c00-980e8ea270a4';
const PATH = `${ORCH}/2026-10-23/${ID}.webp`;
const payload = {
    id: ID, orchard_id: ORCH, picker_id: 'p1', inspector_id: 'i1', grade: 'B' as const,
    photo_url: null, photo_file_id: ID, photo_path: PATH,
};

beforeEach(async () => {
    vi.restoreAllMocks();
    await db.pending_files.clear();
    await pendingFiles.put(ID, 'qc', new Blob(['webp'], { type: 'image/webp' }), 'image/webp');
});

describe('processQCInspection with a photo taken offline', () => {
    it('uploads the photo first, then saves the inspection with it and frees the phone', async () => {
        const upload = vi.spyOn(qcRepository, 'uploadPhoto').mockResolvedValue(PATH);
        const insert = vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: { id: ID }, error: null } as never);

        await processQCInspection(payload);

        expect(upload).toHaveBeenCalledWith(PATH, expect.any(Blob));
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: ID, photo_url: PATH }));
        expect(upload.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]);
        expect(await pendingFiles.has(ID)).toBe(false);
    });

    it('no signal for the photo: nothing is saved and it is retried later', async () => {
        vi.spyOn(qcRepository, 'uploadPhoto').mockRejectedValue(new TypeError('Failed to fetch'));
        const insert = vi.spyOn(qcRepository, 'insert');

        await expect(processQCInspection(payload)).rejects.toThrow(/fetch/);
        expect(insert).not.toHaveBeenCalled();
        expect(await pendingFiles.has(ID)).toBe(true);
    });

    it('already saved by an earlier attempt (same id): done, file freed', async () => {
        vi.spyOn(qcRepository, 'uploadPhoto').mockResolvedValue(PATH);
        vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } } as never);

        await expect(processQCInspection(payload)).resolves.toBeUndefined();
        expect(await pendingFiles.has(ID)).toBe(false);
    });

    it('photo gone from the phone: the inspection is still saved, without photo', async () => {
        await pendingFiles.delete(ID);
        const upload = vi.spyOn(qcRepository, 'uploadPhoto');
        const insert = vi.spyOn(qcRepository, 'insert').mockResolvedValue({ data: { id: ID }, error: null } as never);

        await processQCInspection(payload);
        expect(upload).not.toHaveBeenCalled();
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: ID, photo_url: null }));
    });

    it('the queue schema keeps the id, the file and the path (and rejects a path outside the orchard folder layout)', () => {
        const parsed = schemas.QCInspectionPayloadSchema.parse(payload);
        expect(parsed).toMatchObject({ id: ID, photo_file_id: ID, photo_path: PATH });
        expect(() => schemas.QCInspectionPayloadSchema.parse({ ...payload, photo_path: '../other/x.webp' })).toThrow();
    });
});
