/** Fotos de QC privadas: de lo guardado (ruta nueva o enlace público antiguo) a la ruta del bucket */
import { describe, it, expect } from 'vitest';
import { qcPhotoPath } from './useQcPhotoUrl';

describe('qcPhotoPath', () => {
  it('keeps a stored path as it is', () => {
    expect(qcPhotoPath('o1/2026-10-18/abc.webp')).toBe('o1/2026-10-18/abc.webp');
  });
  it('extracts the path from an old public URL', () => {
    expect(
      qcPhotoPath(
        'http://127.0.0.1:54321/storage/v1/object/public/qc-photos/o1/2026-10-18/abc.webp'
      )
    ).toBe('o1/2026-10-18/abc.webp');
  });
  it('ignores query strings and decodes the path', () => {
    expect(
      qcPhotoPath('https://x.supabase.co/storage/v1/object/public/qc-photos/o%201/a.webp?t=1')
    ).toBe('o 1/a.webp');
  });
  it('returns null for empty values and for links outside the bucket', () => {
    expect(qcPhotoPath(null)).toBeNull();
    expect(qcPhotoPath('')).toBeNull();
    expect(qcPhotoPath('https://example.com/photo.jpg')).toBeNull();
    expect(qcPhotoPath('blob:http://localhost/123')).toBeNull();
  });
});
