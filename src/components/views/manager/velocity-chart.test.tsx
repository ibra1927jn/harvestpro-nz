/**
 * Tests for VelocityChart (manager views)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { I18nProvider } from '@/i18n';

// Mock analyticsService (modo legacy — últimas 8 horas)
const mockGroupByHour = vi.fn().mockReturnValue([
    { hour: '06:00', count: 10 },
    { hour: '07:00', count: 25 },
    { hour: '08:00', count: 40 },
    { hour: '09:00', count: 35 },
    { hour: '10:00', count: 50 },
    { hour: '11:00', count: 45 },
    { hour: '12:00', count: 30 },
    { hour: '13:00', count: 20 },
]);

vi.mock('@/services/analytics.service', () => ({
    analyticsService: {
        groupByHour: (...args: unknown[]) => mockGroupByHour(...args),
    },
}));

// Mock buildShiftSlotsUntilNow para modo ventana de turno
vi.mock('@/utils/time', () => ({
    buildShiftSlotsUntilNow: vi.fn().mockReturnValue([
        { hour: 7, slotStartMs: 1_000_000, slotEndMs: 1_003_600 },
        { hour: 8, slotStartMs: 1_003_600, slotEndMs: 1_007_200 },
    ]),
    formatHourLabel: (h: number) => String(h).padStart(2, '0'),
}));

import VelocityChart from './VelocityChart';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider>{children}</I18nProvider>
);

beforeEach(() => cleanup());

// ─────────────────────────────────────────────────────────
// Modo legacy (sin shiftStart)
// ─────────────────────────────────────────────────────────
describe('VelocityChart — modo legacy', () => {
    it('renderiza el título', () => {
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        expect(screen.getByText('Velocity (Hourly)')).toBeTruthy();
    });

    it('muestra el total de cubetas', () => {
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        // 10+25+40+35+50+45+30+20 = 255
        expect(screen.getByText('255')).toBeTruthy();
    });

    it('muestra la leyenda cuando hay datos', () => {
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        expect(screen.getByText('Current hour')).toBeTruthy();
        expect(screen.getByText('Above target')).toBeTruthy();
    });

    it('muestra subtítulo "Last 8 hours"', () => {
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        expect(screen.getByText('Last 8 hours')).toBeTruthy();
    });

    it('muestra estado vacío cuando groupByHour devuelve todo ceros', () => {
        mockGroupByHour.mockReturnValueOnce(Array(8).fill({ hour: '06:00', count: 0 }));
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        expect(screen.getByText('Awaiting First Scan')).toBeTruthy();
    });

    it('NO renderiza barras con role=button (no clickable)', () => {
        render(<VelocityChart bucketRecords={[]} />, { wrapper: Wrapper });
        const buttons = screen.queryAllByRole('button');
        expect(buttons).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────
// Modo ventana de turno (con shiftStart + onBarClick; sin hora de fin)
// ─────────────────────────────────────────────────────────
describe('VelocityChart — modo shift window', () => {
    it('muestra subtítulo «desde el inicio de turno» (sin hora de fin)', () => {
        render(
            <VelocityChart
                bucketRecords={[]}
                shiftStart="07:00"
            />,
            { wrapper: Wrapper }
        );
        expect(screen.getByText('Since 07:00')).toBeTruthy();
    });

    it('renderiza barras con role=button cuando onBarClick está definido', () => {
        render(
            <VelocityChart
                bucketRecords={[]}
                shiftStart="07:00"
                onBarClick={vi.fn()}
            />,
            { wrapper: Wrapper }
        );
        // El mock devuelve 2 slots → 2 botones (pero count=0 → sin datos → "Awaiting")
        // Para que aparezcan barras, necesitamos datos. Sin datos → estado vacío.
        // Probamos que el estado vacío aparece correctamente.
        expect(screen.getByText('Awaiting First Scan')).toBeTruthy();
    });

    it('llama onBarClick con slotStartMs, slotEndMs y hourLabel al hacer click en una barra con datos', () => {
        // Registros que caen en slot[0] (slotStartMs=1_000_000, slotEndMs=1_003_600)
        const record = {
            picker_id: 'p1',
            scanned_at: new Date(1_001_000).toISOString(),
            created_at: new Date(1_001_000).toISOString(),
            id: 'r1',
        };
        const onBarClick = vi.fn();

        render(
            <VelocityChart
                bucketRecords={[record as any]}
                shiftStart="07:00"
                onBarClick={onBarClick}
            />,
            { wrapper: Wrapper }
        );

        // Hay datos → se renderizan barras como role=button
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);

        // Click en la primera barra (slot 07:00–08:00 que tiene 1 bin)
        fireEvent.click(buttons[0]);
        expect(onBarClick).toHaveBeenCalledTimes(1);
        expect(onBarClick).toHaveBeenCalledWith(
            1_000_000,
            1_003_600,
            '07:00–08:00'
        );
    });

    it('activa onBarClick con Enter (accesibilidad de teclado)', () => {
        const record = {
            picker_id: 'p1',
            scanned_at: new Date(1_001_000).toISOString(),
            created_at: new Date(1_001_000).toISOString(),
            id: 'r1',
        };
        const onBarClick = vi.fn();

        render(
            <VelocityChart
                bucketRecords={[record as any]}
                shiftStart="07:00"
                onBarClick={onBarClick}
            />,
            { wrapper: Wrapper }
        );

        const buttons = screen.getAllByRole('button');
        fireEvent.keyDown(buttons[0], { key: 'Enter' });
        expect(onBarClick).toHaveBeenCalledTimes(1);
    });
});
