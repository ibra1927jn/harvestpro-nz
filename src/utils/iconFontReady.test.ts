import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markWhenIconFontReady, ICON_FONT } from './iconFontReady';

function fakeDoc(fonts?: Partial<FontFaceSet>): Document {
  const root = document.createElement('html');
  return { documentElement: root, fonts } as unknown as Document;
}

describe('markWhenIconFontReady', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('no marca la página hasta que la fuente termina de cargar', async () => {
    let resolveLoad: (v: FontFace[]) => void = () => undefined;
    const load = vi.fn(() => new Promise<FontFace[]>(r => (resolveLoad = r)));
    const doc = fakeDoc({ load } as unknown as FontFaceSet);
    const p = markWhenIconFontReady(doc);
    expect(load).toHaveBeenCalledWith(ICON_FONT, 'home');
    expect(doc.documentElement.classList.contains('icons-ready')).toBe(false);
    resolveLoad([]);
    await p;
    expect(doc.documentElement.classList.contains('icons-ready')).toBe(true);
  });

  it('si la carga falla (offline sin caché) marca igualmente', async () => {
    const doc = fakeDoc({ load: vi.fn(() => Promise.reject(new Error('net'))) } as unknown as FontFaceSet);
    await markWhenIconFontReady(doc);
    expect(doc.documentElement.classList.contains('icons-ready')).toBe(true);
  });

  it('sin FontFaceSet (navegador antiguo) marca al momento', async () => {
    const doc = fakeDoc(undefined);
    await markWhenIconFontReady(doc);
    expect(doc.documentElement.classList.contains('icons-ready')).toBe(true);
  });
});
