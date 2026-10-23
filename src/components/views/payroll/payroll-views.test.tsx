/**
 * ExportHistoryTab — historial de exportaciones en el servidor (payroll_exports).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const list = vi.fn();
const log = vi.fn();
const remove = vi.fn();
vi.mock('@/repositories/payroll-exports.repository', () => ({
  payrollExportsRepository: {
    list: (...a: unknown[]) => list(...a),
    log: (...a: unknown[]) => log(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));

import ExportHistoryTab, { logExportToHistory } from './ExportHistoryTab';

const rec = (id: string, filename: string) => ({
  id, exported_by: 'u1', exported_at: '2026-10-13T09:00:00+13:00', week_start: '2026-10-06', week_end: '2026-10-12',
  format: 'xero', filename, record_count: 10, total_earnings: '1234.50', week_status: 'final',
});

beforeEach(() => { list.mockReset(); log.mockReset(); remove.mockReset(); });

describe('logExportToHistory', () => {
  it('logs the export on the server', async () => {
    log.mockResolvedValue({});
    const entry = { week_start: '2026-10-06', week_end: '2026-10-12', format: 'csv' as const, filename: 'p.csv', record_count: 3, total_earnings: 99 };
    expect(await logExportToHistory(entry)).toBe(true);
    expect(log).toHaveBeenCalledWith(entry);
  });

  it('does not throw if it cannot log (the file was already downloaded)', async () => {
    log.mockRejectedValue(new Error('offline'));
    expect(await logExportToHistory({ week_start: 'a', week_end: 'b', format: 'pdf', filename: 'x', record_count: 0, total_earnings: 0 })).toBe(false);
  });
});

describe('ExportHistoryTab', () => {
  it('lists the server history with week and format', async () => {
    list.mockResolvedValue([rec('e1', 'xero-week.csv')]);
    render(<ExportHistoryTab />);
    expect(await screen.findByText('xero-week.csv')).toBeTruthy();
    expect(screen.getByText(/XERO/)).toBeTruthy();
  });

  it('shows the empty state', async () => {
    list.mockResolvedValue([]);
    render(<ExportHistoryTab />);
    expect(await screen.findByText(/No exports yet/i)).toBeTruthy();
  });

  it('Delete asks first and then removes it on the server', async () => {
    list.mockResolvedValue([rec('e1', 'xero-week.csv')]);
    remove.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ExportHistoryTab />);
    const btn = await screen.findByRole('button', { name: 'Delete xero-week.csv from the history' });
    fireEvent.click(btn);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(btn);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(screen.queryByText('xero-week.csv')).toBeNull());
    confirm.mockRestore();
  });

  it('says so when the history cannot load', async () => {
    list.mockRejectedValue(new Error('offline'));
    render(<ExportHistoryTab />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
