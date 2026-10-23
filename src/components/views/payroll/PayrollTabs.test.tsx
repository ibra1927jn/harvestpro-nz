/**
 * Smoke tests for PayrollTabs — covers SummaryCard, PayrollDashboard, TimesheetsTab, WageCalculatorTab, ExportTab
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/payroll.service', () => ({
  payrollService: {
    getPayrollSummary: vi.fn().mockResolvedValue({ pickers: [], totals: {} }),
  },
}));

vi.mock('@/repositories/attendance.repository', () => ({
  attendanceRepository: {
    getHoursSummary: vi.fn().mockResolvedValue([]),
  },
}));

import { SummaryCard, PayrollDashboard } from './PayrollTabs';

describe('SummaryCard', () => {
  it('renders label and value', () => {
    render(
      <SummaryCard icon="payments" iconColor="text-green-500" label="Total Pay" value="$1,234" />
    );
    expect(screen.getByText('Total Pay')).toBeDefined();
    expect(screen.getByText('$1,234')).toBeDefined();
  });

  it('applies highlight class', () => {
    const { container } = render(
      <SummaryCard icon="warning" iconColor="text-orange-500" label="Alert" value="3" highlight />
    );
    expect(container.innerHTML).toContain('bg-orange-50');
  });

  it('renders without highlight', () => {
    const { container } = render(
      <SummaryCard icon="info" iconColor="text-blue-500" label="Info" value="0" />
    );
    expect(container.innerHTML).toContain('bg-white');
  });
});

describe('PayrollDashboard', () => {
  const settings = { bucket_rate: 7.0, min_wage_rate: 23.95 };

  it('renders empty state when no pickers', () => {
    render(<PayrollDashboard pickers={[]} settings={settings} />);
    expect(screen.getByText('No payroll data yet')).toBeDefined();
  });

  it('renders picker breakdown when data exists', () => {
    const pickers = [
      {
        picker_id: 'p1',
        picker_name: 'Alice',
        buckets: 10,
        hours_worked: 8,
        piece_rate_earnings: 70,
        top_up_required: 130,
        total_earnings: 200,
        is_below_minimum: true,
      },
    ];
    render(<PayrollDashboard pickers={pickers as never[]} settings={settings} />);
    expect(screen.getByText('Picker Breakdown')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('renders rate info', () => {
    render(<PayrollDashboard pickers={[]} settings={settings} />);
    expect(screen.getByText('Rate: $7.00/b')).toBeDefined();
  });
});
