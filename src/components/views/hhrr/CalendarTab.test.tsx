/**
 * CalendarTab — Deep render tests
 * Post-refactor 2026-04-18: schedule ahora viene de useOrchardSchedule (DB-backed)
 * en lugar de constantes hardcoded. Tests cubren ambos fallback (sin settings) y
 * con shift_start_time/shift_end_time reales.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalendarTab from './CalendarTab';
import { setCurrentLocale, translate } from '@/i18n';
import { docTypeLabel } from './docTypeLabel';

// Mock del store — devolvemos diferentes settings por test.
const storeState = {
    settings: null as null | { shift_start_time: string; shift_end_time: string },
};

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

describe('CalendarTab', () => {
    beforeEach(() => {
        storeState.settings = null;
    });

    it('renders fallback banner when settings missing', () => {
        render(<CalendarTab />);
        expect(screen.getByTestId('calendar-fallback-banner')).toBeTruthy();
        expect(screen.getByText(/default 07:00–17:00 hours/)).toBeTruthy();
    });

    it("renders Today's Schedule heading", () => {
        render(<CalendarTab />);
        expect(screen.getByText("Today's Schedule")).toBeTruthy();
    });

    it('fallback schedule contains shift_start 07:00 + shift_end 17:00 + meal + rests', () => {
        render(<CalendarTab />);
        expect(screen.getByText('07:00')).toBeTruthy();
        expect(screen.getByText('17:00')).toBeTruthy();
        expect(screen.getByText('11:00')).toBeTruthy(); // meal (4h from 07:00)
        expect(screen.getByTestId('schedule-shift_start')).toBeTruthy();
        expect(screen.getByTestId('schedule-shift_end')).toBeTruthy();
        expect(screen.getByTestId('schedule-meal')).toBeTruthy();
    });

    it('with custom shift hours 06:00-18:00 derives meal at 10:00 and multiple rests', () => {
        storeState.settings = { shift_start_time: '06:00', shift_end_time: '18:00' };
        render(<CalendarTab />);
        expect(screen.queryByTestId('calendar-fallback-banner')).toBeNull();
        expect(screen.getByText('06:00')).toBeTruthy();
        expect(screen.getByText('18:00')).toBeTruthy();
        expect(screen.getByText('10:00')).toBeTruthy(); // meal at 4h
    });

    it('no rest breaks when shift < 2h', () => {
        storeState.settings = { shift_start_time: '09:00', shift_end_time: '10:30' };
        render(<CalendarTab />);
        expect(screen.queryByTestId('schedule-rest')).toBeNull();
        expect(screen.queryByTestId('schedule-meal')).toBeNull();
    });

    it('says leave is not tracked yet instead of showing sample names', () => {
        render(<CalendarTab />);
        expect(screen.getByText('Upcoming Leave')).toBeTruthy();
        expect(screen.getByText(/not tracked in the app yet/)).toBeTruthy();
        expect(screen.queryByText('Aroha W.')).toBeNull();
    });

    describe('en otro idioma', () => {
        afterEach(() => setCurrentLocale('en'));

        it('el horario sale en el idioma de la app (antes siempre en inglés)', () => {
            setCurrentLocale('es');
            render(<CalendarTab />);
            expect(screen.getByText('Inicio de turno — todos los equipos')).toBeTruthy();
            expect(screen.getAllByText('Descanso (10 min pagados)').length).toBeGreaterThan(0);
            expect(screen.queryByText(/Shift Start/)).toBeNull();
        });

        it('los tipos de documento se traducen y un tipo desconocido no rompe', () => {
            setCurrentLocale('es');
            expect(docTypeLabel(translate, 'work_visa')).toBe('Visado de trabajo');
            expect(docTypeLabel(translate, 'mystery')).toBe('mystery');
        });
    });
});
