/** El panel de nómina enseña a todos los trabajadores: 50 y «Ver todos» (antes 12 de 24) */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PayrollDashboard, PAYROLL_PAGE_SIZE } from './PayrollDashboard';
import type { PickerBreakdown } from '@/services/payroll.service';

const pickers = (n: number) => Array.from({ length: n }, (_, i) => ({
    picker_id: `p${i}`, picker_name: `Worker ${i}`, buckets: 10, hours_worked: 8, piece_rate_earnings: 70,
    top_up_required: 0, total_earnings: 200, is_below_minimum: false,
})) as unknown as PickerBreakdown[];

describe('PayrollDashboard', () => {
    it('shows all 24 workers', () => {
        render(<PayrollDashboard pickers={pickers(24)} settings={{ bucket_rate: 7, min_wage_rate: 23.5 }} />);
        expect(within(screen.getByTestId('payroll-breakdown')).getAllByRole('row')).toHaveLength(25);
        expect(screen.getByText('Worker 23')).toBeTruthy();
        expect(screen.getByTestId('payroll-breakdown-footer').textContent).toContain('Showing 24 of 24 workers');
    });

    it('pages a big crew and "Show all" shows everyone', () => {
        render(<PayrollDashboard pickers={pickers(120)} settings={{ bucket_rate: 7, min_wage_rate: 23.5 }} />);
        expect(within(screen.getByTestId('payroll-breakdown')).getAllByRole('row')).toHaveLength(PAYROLL_PAGE_SIZE + 1);
        fireEvent.click(screen.getByRole('button', { name: 'Show all (120)' }));
        expect(within(screen.getByTestId('payroll-breakdown')).getAllByRole('row')).toHaveLength(121);
    });
});
