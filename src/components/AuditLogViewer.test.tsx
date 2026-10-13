/**
 * Smoke tests for AuditLogViewer component
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/hooks/useAuditLogs', () => ({
  useAuditLogs: () => ({
    logs: [
      {
        id: '1',
        created_at: '2026-03-10T12:00:00Z',
        user_email: 'admin@test.com',
        action: 'INSERT',
        table_name: 'users',
        record_id: 'r1',
        old_data: null,
        new_data: { name: 'Alice' },
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/utils/nzst', () => ({
  toNZST: (d: Date) => d.toISOString(),
  nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

vi.mock('date-fns', () => ({
  format: (_d: Date, _f: string) => '2026-03-10 12:00',
}));

import { AuditLogViewer } from './AuditLogViewer';

describe('AuditLogViewer', () => {
  it('renders the audit log table', () => {
    render(<AuditLogViewer />);
    expect(screen.getByText('admin@test.com')).toBeDefined();
  });

  it('renders action type', () => {
    render(<AuditLogViewer />);
    expect(screen.getByText('INSERT')).toBeDefined();
  });

  it('renders without crashing when empty', () => {
    vi.doMock('@/hooks/useAuditLogs', () => ({
      useAuditLogs: () => ({ logs: [], isLoading: false, refetch: vi.fn() }),
    }));
    const { container } = render(<AuditLogViewer />);
    expect(container.firstChild).not.toBeNull();
  });
});
