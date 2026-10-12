/**
 * Tests for HHRR views: CalendarTab
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import CalendarTab from './CalendarTab';

describe('CalendarTab', () => {
    it('renders fallback banner when shift hours not configured', () => {
        render(<CalendarTab />);
        expect(screen.getByTestId('calendar-fallback-banner')).toBeTruthy();
        expect(screen.getByText(/Orchard settings incompletos/)).toBeTruthy();
    });

    it('renders Today\'s Schedule section', () => {
        render(<CalendarTab />);
        expect(screen.getByText("Today's Schedule")).toBeTruthy();
    });

    it('renders derived schedule items (shift + breaks)', () => {
        render(<CalendarTab />);
        expect(screen.getByText('Shift Start — All Teams')).toBeTruthy();
        expect(screen.getByText('Shift End — Day Closure')).toBeTruthy();
        // Meal break a las 4h del inicio (Employment Relations Act 2000)
        expect(screen.getByText(/Meal Break/)).toBeTruthy();
    });

    it('renders time slots', () => {
        render(<CalendarTab />);
        expect(screen.getByText('07:00')).toBeTruthy();
        expect(screen.getByText('17:00')).toBeTruthy();
    });

    it('renders Upcoming Leave section', () => {
        render(<CalendarTab />);
        expect(screen.getByText('Upcoming Leave')).toBeTruthy();
    });

    it('shows no sample leave entries', () => {
        render(<CalendarTab />);
        expect(screen.queryByText('Aroha W.')).toBeNull();
    });
});
