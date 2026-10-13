/**
 * ScannerModal con lector de pantalla / teclado: diálogo con nombre, campo
 * manual etiquetado, Escape cierra y cada código del lote se anuncia.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('qr-scanner', () => {
  class FakeScanner {
    static WORKER_PATH = '';
    start() {
      return Promise.reject(new Error('no camera in tests'));
    }
    stop() {}
    destroy() {}
  }
  return { default: FakeScanner };
});
vi.mock('qr-scanner/qr-scanner-worker.min.js?url', () => ({ default: '' }));
vi.mock('@/services/native-scanner.service', () => ({
  nativeScannerService: {
    isNativePlatform: () => false,
    scanNative: vi.fn(),
    stopNativeScan: vi.fn(),
  },
}));
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import ScannerModal from './ScannerModal';
import { subscribeAnnouncer, resetAnnouncerForTests } from '@/services/announcer';

describe('ScannerModal accessibility', () => {
  beforeEach(() => resetAnnouncerForTests());

  it('is a named modal dialog with a labelled manual code field', async () => {
    render(<ScannerModal onClose={vi.fn()} onScan={vi.fn()} scanType="BUCKET" batchMode />);
    const dialog = screen.getByRole('dialog', { name: 'Scan bucket' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Sin cámara pasa solo a entrada manual
    const input = await screen.findByRole('textbox', { name: 'Enter bucket code' });
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Camera unavailable');
  });

  it('closes with Escape', () => {
    const onClose = vi.fn();
    render(<ScannerModal onClose={onClose} onScan={vi.fn()} scanType="BUCKET" batchMode />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('announces each code added to the batch, and the close button has a name', async () => {
    const heard: string[] = [];
    const off = subscribeAnnouncer(m => heard.push(m));
    render(<ScannerModal onClose={vi.fn()} onScan={vi.fn()} scanType="BUCKET" batchMode />);
    expect(screen.getByRole('button', { name: 'Close scanner' })).toBeInTheDocument();
    const input = await screen.findByRole('textbox', { name: 'Enter bucket code' });
    fireEvent.change(input, { target: { value: 'bkt-1' } });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit Code' }));
    });
    off();
    expect(heard).toContain('BKT-1 added. 1 bucket in batch.');
    // El icono de ligadura no forma parte del nombre del botón
    expect(screen.getByRole('button', { name: 'Complete Batch (1)' })).toBeInTheDocument();
  });
});
