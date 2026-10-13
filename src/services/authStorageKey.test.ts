/**
 * resolveAuthTabId — al reabrir la PWA (sessionStorage vacío) hay que reutilizar
 * la sesión guardada en localStorage en vez de crear una clave nueva vacía.
 */
import { describe, it, expect } from 'vitest';
import { resolveAuthTabId, AUTH_KEY_PREFIX, TAB_ID_KEY } from './authStorageKey';

class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const session = (exp: number, refresh = 'rt') =>
  JSON.stringify({ access_token: 'at', refresh_token: refresh, expires_at: exp });

describe('resolveAuthTabId', () => {
  it('keeps the tab id already stored for this tab', () => {
    const s = new MemStorage();
    const l = new MemStorage();
    s.setItem(TAB_ID_KEY, 'tab_1_abc');
    l.setItem(`${AUTH_KEY_PREFIX}tab_2_def`, session(999));
    expect(resolveAuthTabId(s, l)).toBe('tab_1_abc');
  });

  it('adopts the persisted session when the app is reopened', () => {
    const s = new MemStorage();
    const l = new MemStorage();
    l.setItem(`${AUTH_KEY_PREFIX}tab_100_old`, session(100));
    l.setItem(`${AUTH_KEY_PREFIX}tab_200_new`, session(200));
    l.setItem(`${AUTH_KEY_PREFIX}tab_200_new-code-verifier`, '"x"');
    expect(resolveAuthTabId(s, l)).toBe('tab_200_new');
    // queda fijado para esta pestaña
    expect(s.getItem(TAB_ID_KEY)).toBe('tab_200_new');
  });

  it('ignores corrupt or token-less entries and creates a new id', () => {
    const s = new MemStorage();
    const l = new MemStorage();
    l.setItem(`${AUTH_KEY_PREFIX}tab_1_bad`, '{not json');
    l.setItem(`${AUTH_KEY_PREFIX}tab_2_empty`, JSON.stringify({ expires_at: 5 }));
    const id = resolveAuthTabId(s, l);
    expect(id).toMatch(/^tab_\d+_[a-z0-9]+$/);
    expect(id).not.toBe('tab_1_bad');
    expect(id).not.toBe('tab_2_empty');
  });

  it('works without storage (SSR / blocked storage)', () => {
    expect(resolveAuthTabId(null, null)).toMatch(/^tab_/);
  });
});
