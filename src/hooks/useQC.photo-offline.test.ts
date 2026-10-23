/**
 * useQC — foto de la inspección sin cobertura: se guarda en el móvil con la
 * inspección (mismo id) en vez de perderse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const logInspection = vi.fn();
vi.mock('@/services/qc.service', () => ({
    qcService: {
        getInspections: vi.fn().mockResolvedValue([]),
        logInspection: (...a: unknown[]) => logInspection(...a),
    },
}));
const uploadPhoto = vi.fn();
vi.mock('@/repositories/qc.repository', () => ({
    qcRepository: { uploadPhoto: (...a: unknown[]) => uploadPhoto(...a) },
}));
vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: () => ({
        crew: [{ id: 'p1', name: 'Alice', picker_id: '101', current_row: 7 }],
        orchard: { id: 'o1', name: 'Test Orchard' },
    }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ appUser: { id: 'u1', role: 'qc_inspector' } }) }));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { useQC } from './useQC';
import { db } from '@/services/db';
import { pendingFiles, PENDING_FILES_MAX_BYTES } from '@/services/pending-files.service';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
const photo = () => new Blob(['webp-bytes'], { type: 'image/webp' });

async function grade() {
    const hook = renderHook(() => useQC());
    act(() => hook.result.current.setSelectedPicker(hook.result.current.crew[0]));
    await act(async () => { await hook.result.current.handleGrade('B', photo()); });
    return hook;
}

beforeEach(async () => {
    logInspection.mockReset().mockImplementation(async (p: { id: string }) => ({ id: p.id, grade: 'B', picker_id: 'p1' }));
    uploadPhoto.mockReset();
    await db.pending_files.clear();
    setOnline(true);
});

describe('useQC photo without signal', () => {
    it('online: uploads the photo named after the inspection and saves its path', async () => {
        uploadPhoto.mockImplementation(async (path: string) => path);
        await grade();
        const path = uploadPhoto.mock.calls[0][0] as string;
        const sent = logInspection.mock.calls[0][0];
        expect(path).toBe(`o1/${path.split('/')[1]}/${sent.id}.webp`);
        expect(sent).toMatchObject({ photoUrl: path });
        expect(sent.pendingPhoto).toBeUndefined();
        expect(await db.pending_files.count()).toBe(0);
    });

    it('offline: keeps the photo on the phone with the inspection (same id) for the queue', async () => {
        setOnline(false);
        const { result } = await grade();
        expect(uploadPhoto).not.toHaveBeenCalled();
        const sent = logInspection.mock.calls[0][0];
        expect(sent.photoUrl).toBeUndefined();
        expect(sent.pendingPhoto).toEqual({ fileId: sent.id, path: expect.stringMatching(new RegExp(`^o1/\\d{4}-\\d{2}-\\d{2}/${sent.id}\\.webp$`)) });
        expect(await pendingFiles.has(sent.id)).toBe(true);
        expect(result.current.photoWarning).toBeNull();
    });

    it('upload fails with signal: same as offline, the photo is not lost', async () => {
        uploadPhoto.mockRejectedValue(new Error('503 Service Unavailable'));
        await grade();
        const sent = logInspection.mock.calls[0][0];
        expect(sent.pendingPhoto?.fileId).toBe(sent.id);
        expect(await pendingFiles.has(sent.id)).toBe(true);
    });

    it('no room on the phone: the inspection is saved and the photo loss is said', async () => {
        setOnline(false);
        await db.pending_files.put({ id: 'big', kind: 'chat', mime: 'application/pdf', size: PENDING_FILES_MAX_BYTES, iv: null, data: new ArrayBuffer(1), created_at: 0 });
        const { result } = await grade();
        expect(logInspection.mock.calls[0][0].pendingPhoto).toBeUndefined();
        expect(result.current.photoWarning).toMatch(/could not be kept/);
    });
});
