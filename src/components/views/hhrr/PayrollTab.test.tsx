/**
 * PayrollTab — Deep render tests
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PayrollTab from './PayrollTab';

const makePayrollEntry = (id: string, name: string, hours: number, buckets: number, totalPay: number, wageShield: boolean) => ({
    id, employee_name: name, hours_worked: hours,
    buckets_picked: buckets, total_pay: totalPay,
    wage_shield_applied: wageShield,
}) as any;

const makeSummary = (payroll = 12500) => ({
    payrollThisWeek: payroll,
}) as any;

describe('PayrollTab', () => {
    const payroll = [
        makePayrollEntry('p1', 'Alice Smith', 40, 320, 950, false),
        makePayrollEntry('p2', 'Bob Jones', 38, 220, 680, true),
        makePayrollEntry('p3', 'Charlie B.', 42, 380, 1100, false),
    ];

    const summary = makeSummary(12500);

    it('renders Weekly Payroll Summary heading', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('Weekly Payroll Summary')).toBeTruthy();
    });

    it('renders total payroll amount', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('$12.5k')).toBeTruthy();
    });

    it('renders summary labels', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        const totalLabels = screen.getAllByText('Total');
        expect(totalLabels.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Above Min')).toBeTruthy();
        expect(screen.getAllByText('Wage Shield').length).toBeGreaterThanOrEqual(1);
    });

    it('renders Above Min count (non-shield)', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        // 2 employees without wage shield (Alice, Charlie)
        expect(screen.getByText('2')).toBeTruthy();
    });

    it('renders employee names', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('Alice Smith')).toBeTruthy();
        expect(screen.getByText('Bob Jones')).toBeTruthy();
        expect(screen.getByText('Charlie B.')).toBeTruthy();
    });

    it('renders total pay amounts', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('$950')).toBeTruthy();
        expect(screen.getByText('$680')).toBeTruthy();
        expect(screen.getByText('$1,100')).toBeTruthy();
    });

    it('renders hours worked', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('40h worked')).toBeTruthy();
        expect(screen.getByText('38h worked')).toBeTruthy();
    });

    it('renders bucket counts', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        expect(screen.getByText('320 buckets')).toBeTruthy();
        expect(screen.getByText('220 buckets')).toBeTruthy();
    });

    it('shows Wage Shield badge for protected employees', () => {
        render(<PayrollTab payroll={payroll} summary={summary} />);
        // Bob has wage_shield_applied = true
        const shieldBadges = screen.getAllByText('Wage Shield');
        expect(shieldBadges.length).toBeGreaterThanOrEqual(2); // 1 in summary + 1 on entry
    });

    it('renders with empty payroll', () => {
        render(<PayrollTab payroll={[]} summary={makeSummary(0)} />);
        expect(screen.getByText('Weekly Payroll Summary')).toBeTruthy();
    });
});
