/**
 * La cámara sigue encendida durante todo el lote. Antes el callback del
 * escáner era dependencia del efecto: tras cada código leído la cámara se
 * apagaba y volvía a arrancar, y en lote dejaba de leer el siguiente código.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const cam = vi.hoisted(() => ({
  created: 0,
  destroyed: 0,
  onResult: null as null | ((r: { data: string }) => void),
}));

vi.mock('qr-scanner', () => {
  class FakeScanner {
    static WORKER_PATH = '';
    constructor(_video: HTMLVideoElement, onResult: (r: { data: string }) => void) {
      cam.created++;
      cam.onResult = onResult;
    }
    start() {
      return Promise.resolve();
    }
    stop() {}
    destroy() {
      cam.destroyed++;
    }
  }
  return { default: FakeScanner };
});
vi.mock('@/services/native-scanner.service', () => ({
  nativeScannerService: {
    isNativePlatform: () => false,
    scanNative: vi.fn(),
    stopNativeScan: vi.fn(),
  },
}));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import ScannerModal from './ScannerModal';

describe('ScannerModal camera in batch mode', () => {
  beforeEach(() => {
    cam.created = 0;
    cam.destroyed = 0;
    cam.onResult = null;
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  it('keeps one camera session while several stickers are scanned', async () => {
    render(<ScannerModal onClose={vi.fn()} onScan={vi.fn()} scanType="BUCKET" batchMode />);
    await act(async () => {});
    expect(cam.created).toBe(1);

    for (const code of ['LOC-001', 'LOC-002', 'LOC-003']) {
      act(() => cam.onResult?.({ data: code }));
      act(() => {
        vi.advanceTimersByTime(800); // más que el antirrebote de 500 ms
      });
    }

    expect(screen.getByText('3 scanned in batch', { exact: false })).toBeInTheDocument();
    expect(cam.created).toBe(1);
    expect(cam.destroyed).toBe(0);
    vi.useRealTimers();
  });
});
