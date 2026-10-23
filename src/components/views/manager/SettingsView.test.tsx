/**
 * SettingsView — Deep render + interaction tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils';

const mockHandleChange = vi.fn();
const mockHandleSave = vi.fn();
const mockSetCompliance = vi.fn();
const mockHandleNotifToggle = vi.fn();
const mockHandleNotifType = vi.fn();
const mockHandleSendTest = vi.fn();

vi.mock('@/hooks/useSettings', () => ({
    useSettings: () => ({
        orchard: { id: 'o1', name: 'Green Valley Orchard', total_rows: 42 },
        currentUser: { id: 'u1', name: 'John Manager', role: 'manager' },
        initials: 'JM',
        formData: {
            piece_rate: 6.50,
            min_wage_rate: 23.95,
            min_buckets_per_hour: 4,
            target_tons: 12,
            variety: 'Apple',
        },
        handleChange: mockHandleChange,
        setGeneralRate: vi.fn(),
        compliance: {
            nz_employment_standards: true,
            auto_wage_alerts: true,
            safety_verification: false,
            audit_trail: true,
        },
        setCompliance: mockSetCompliance,
        // Issue 2: permisos de edición de salario mínimo
        canEditMinWage: false,
        // Issue 3: floor de compliance
        complianceFloor: 4,
        // Issue 4: orchard selector
        availableOrchards: [{ id: 'o1', name: 'Green Valley Orchard', total_rows: 42 }],
        orchardVarieties: 'Apple',
        handleOrchardSelect: vi.fn(),
        notifEnabled: true,
        handleNotifToggle: mockHandleNotifToggle,
        notifTypes: {
            visa_expiry: true,
            qc_reject: false,
            transport: true,
            attendance: false,
        },
        handleNotifType: mockHandleNotifType,
        notifTestSent: false,
        handleSendTest: mockHandleSendTest,
        hasChanges: true,
        isSaving: false,
        saveStatus: null,
        handleSave: mockHandleSave,
    }),
}));

vi.mock('@/i18n', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/i18n')>();
    return {
        ...actual,
        useTranslation: () => ({
            locale: 'en' as const,
            setLocale: vi.fn(),
            localeInfo: actual.SUPPORTED_LOCALES[0],
            t: (key: string, params?: Record<string, string | number>) => actual.translate(key, params, 'en'),
        }),
    };
});

vi.mock('./settings/DailyPieceRatesEditor', () => ({
    DailyPieceRatesEditor: ({ orchardId }: { orchardId?: string }) => <div data-testid="daily-piece-rates-editor">{orchardId}</div>,
}));

vi.mock('./DayClosureButton', () => ({
    DayClosureButton: () => <button data-testid="day-closure-btn">Close Day</button>,
}));

vi.mock('@/components/ui/PageHeader', () => ({
    default: ({ title, subtitle }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
        </div>
    ),
}));

vi.mock('./settings/SettingsFormComponents', () => ({
    SettingsSection: ({ title, children }: any) => (
        <section data-testid={`section-${title}`}>
            <h3>{title}</h3>
            {children}
        </section>
    ),
    FormField: ({ label, value, onChange, type }: any) => (
        <div data-testid={`field-${label}`}>
            <label>{label}</label>
            {type === 'select' ? (
                <select value={value} onChange={(e) => onChange(e.target.value)}>
                    <option>{value}</option>
                </select>
            ) : (
                <input value={value} onChange={(e) => onChange(e.target.value)} />
            )}
        </div>
    ),
    ReadonlyField: ({ label, value }: any) => (
        <div data-testid={`readonly-${label}`}>
            <label>{label}</label>
            <span>{value}</span>
        </div>
    ),
    ToggleRow: ({ label, description, checked, onChange, locked }: any) => (
        <div data-testid={`toggle-${label}`}>
            <span>{label}</span>
            {description && <span>{description}</span>}
            <input type="checkbox" checked={checked} onChange={(e) => !locked && onChange(e.target.checked)} />
        </div>
    ),
}));

// Los sub-componentes inline (LockedField, ComplianceTargetField, OrchardSelector)
// viven en SettingsView.tsx y no se mockean — se renderizan como están.

import SettingsView from './SettingsView';

describe('SettingsView', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders Settings page header', () => {
        render(<SettingsView />);
        expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('el precio por cubeta se edita por día (editor de hoy), no como campo general', () => {
        render(<SettingsView />);
        expect(screen.getByTestId('daily-piece-rates-editor').textContent).toBe('o1');
        expect(screen.queryByTestId('field-Piece Rate (per bucket)')).toBeNull();
    });

    it('renders user profile card with initials', () => {
        render(<SettingsView />);
        expect(screen.getByText('JM')).toBeTruthy();
    });

    it('renders user name and role', () => {
        render(<SettingsView />);
        expect(screen.getByText('John Manager')).toBeTruthy();
        expect(screen.getByText(/Manager ·/)).toBeTruthy();
    });

    it('renders orchard name', () => {
        render(<SettingsView />);
        // Orchard name appears in both subtitle and profile card
        expect(screen.getAllByText(/Green Valley Orchard/).length).toBeGreaterThanOrEqual(1);
    });

    it('renders profile stats (Rows, Rate, Target)', () => {
        render(<SettingsView />);
        // Stats cards show: ROWS, RATE, TARGET (all-caps from locale; may appear multiple times on mobile/desktop)
        expect(screen.getAllByText('ROWS').length).toBeGreaterThan(0);
        expect(screen.getAllByText('RATE').length).toBeGreaterThan(0);
        expect(screen.getAllByText('TARGET').length).toBeGreaterThan(0);
    });

    it('renders Harvest Configuration section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Harvest Configuration')).toBeTruthy();
    });

    it('renders Orchard Details section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Orchard Details')).toBeTruthy();
    });

    it('renders Compliance Settings section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Compliance Settings')).toBeTruthy();
    });

    it('renders Notifications section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Notifications')).toBeTruthy();
    });

    it('renders Danger Zone section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Danger Zone')).toBeTruthy();
    });

    it('renders Save Changes button when changes exist', () => {
        render(<SettingsView />);
        expect(screen.getByText('Save Changes')).toBeTruthy();
    });

    it('calls handleSave when Save button clicked', () => {
        render(<SettingsView />);
        fireEvent.click(screen.getByText('Save Changes'));
        expect(mockHandleSave).toHaveBeenCalled();
    });

    it('renders DayClosureButton in Danger Zone', () => {
        render(<SettingsView />);
        expect(screen.getByTestId('day-closure-btn')).toBeTruthy();
    });

    it('renders Day Closure description', () => {
        render(<SettingsView />);
        expect(screen.getByText('Day Closure')).toBeTruthy();
        expect(screen.getByText(/Finalize payroll/)).toBeTruthy();
    });

    it('renders Reset button in Danger Zone', () => {
        render(<SettingsView />);
        expect(screen.getByText('Reset')).toBeTruthy();
    });

    it('renders language selector', () => {
        render(<SettingsView />);
        expect(screen.getByText('English')).toBeTruthy();
        expect(screen.getByText('Español')).toBeTruthy();
        expect(screen.getByText('Français')).toBeTruthy();
        // Idiomas retirados (2026-10-21)
        for (const removed of ['Te Reo Māori', 'Gagana Samoa', 'हिन्दी', 'Lea Faka-Tonga', 'Filipino']) {
            expect(screen.queryByText(removed)).toBeNull();
        }
    });

    it('renders footer with version info', () => {
        render(<SettingsView />);
        expect(screen.getByText(/HarvestPro NZ/)).toBeTruthy();
        expect(screen.getByText(/v9.9.0/)).toBeTruthy();
    });

    it('renders Send Test Notification button when notifs enabled', () => {
        render(<SettingsView />);
        expect(screen.getByText('Send Test Notification')).toBeTruthy();
    });

    it('calls handleSendTest on test notification button click', () => {
        render(<SettingsView />);
        fireEvent.click(screen.getByText('Send Test Notification'));
        expect(mockHandleSendTest).toHaveBeenCalled();
    });

    // ── Issue 2: Minimum Wage permission gating ──────────────────
    it('shows locked minimum wage field for manager role (canEditMinWage=false)', () => {
        render(<SettingsView />);
        // LockedField muestra un candado y el valor como display-only
        expect(screen.getByText('Minimum Wage (per hour)')).toBeTruthy();
        expect(screen.getByText(/\$23\.95 NZD/)).toBeTruthy();
        // Sólo-lectura: no debe haber input editable para ese campo
        const _lockIcon = screen.queryByTitle('Only HR can modify this value');
        // El tooltip está en el span, comprobamos que no hay FormField para minWage
        expect(screen.queryByTestId('field-Minimum Wage (per hour)')).toBeNull();
    });

    // ── Issue 3: Compliance floor auto-calculation ────────────────
    it('shows compliance formula explanation', () => {
        render(<SettingsView />);
        // ComplianceTargetField muestra la fórmula: "Minimum to meet $X/hr at $Y/bucket = Z b/hr"
        expect(screen.getByText(/Minimum to meet/)).toBeTruthy();
        expect(screen.getByText(/b\/hr/)).toBeTruthy();
    });

    // ── Issue 4: Orchard selector ────────────────────────────────
    it('renders orchard details section', () => {
        render(<SettingsView />);
        expect(screen.getByText('Orchard Details')).toBeTruthy();
    });

    it('shows orchard name when only one orchard available', () => {
        render(<SettingsView />);
        // Con un solo orchard, OrchardSelector muestra como texto (no dropdown)
        expect(screen.getByText('Green Valley Orchard')).toBeTruthy();
    });

    // ── Issue 6: Responsive layout ───────────────────────────────
    it('lays the sections out as a masonry (CSS columns), so a short card keeps its own height', () => {
        const { container } = render(<SettingsView />);
        // Antes era un grid: cada fila se estiraba a la tarjeta más alta y
        // «Detalles del huerto» (tres líneas) medía lo que «Cosecha».
        const masonry = container.querySelector('.columns-1');
        expect(masonry).toBeTruthy();
        expect(masonry?.className).toContain('lg:columns-3');
        expect(container.querySelector('.grid.grid-cols-1.md\\:grid-cols-2')).toBeNull();
    });

    it('no shift end time: only the planned start, with the explanation', () => {
        render(<SettingsView />);
        expect(screen.getByLabelText('Shift Start')).toBeTruthy();
        expect(screen.queryByLabelText('Shift End')).toBeNull();
        expect(screen.getByText(/There is no shift end time/)).toBeTruthy();
    });
});
