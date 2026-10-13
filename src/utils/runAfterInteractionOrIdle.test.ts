import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAfterInteractionOrIdle } from './runAfterInteractionOrIdle';

describe('runAfterInteractionOrIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom no tiene requestIdleCallback: forzamos la rama setTimeout
    vi.stubGlobal('requestIdleCallback', undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('no ejecuta nada antes de interacción ni del margen tras load', () => {
    const cb = vi.fn();
    runAfterInteractionOrIdle(cb, { fallbackMs: 10_000 });
    vi.advanceTimersByTime(9_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('se ejecuta una sola vez tras la primera interacción', () => {
    const cb = vi.fn();
    runAfterInteractionOrIdle(cb, { fallbackMs: 10_000 });
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown'));
    vi.advanceTimersByTime(0);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('sin interacción, se ejecuta al cumplirse el margen tras load', () => {
    const cb = vi.fn();
    // jsdom ya está en readyState "complete"
    runAfterInteractionOrIdle(cb, { fallbackMs: 10_000 });
    vi.advanceTimersByTime(10_001);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('usa requestIdleCallback cuando existe', () => {
    const ric = vi.fn((fn: () => void) => {
      fn();
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', ric);
    const cb = vi.fn();
    runAfterInteractionOrIdle(cb, { idleTimeoutMs: 1234 });
    window.dispatchEvent(new Event('touchstart'));
    expect(ric).toHaveBeenCalledWith(expect.any(Function), { timeout: 1234 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancelar evita la ejecución', () => {
    const cb = vi.fn();
    const cancel = runAfterInteractionOrIdle(cb, { fallbackMs: 100 });
    cancel();
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(1_000);
    expect(cb).not.toHaveBeenCalled();
  });
});
