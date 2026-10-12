/**
 * readOnly.test.tsx — §16 read-only mode tests for logistics tab components
 * Verifica que con readOnly=true los controles de escritura estén deshabilitados/ocultos
 * y que la insignia "Read-only" sea visible en las pestañas con acciones.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// --- Mocks del servicio ---
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ appUser: { id: '00000000-0000-4000-8000-000000000001' } }),
}));
vi.mock('@/services/logistics-dept.service', () => ({
    assignVehicleToRequest: vi.fn().mockResolvedValue(undefined),
    completeTransportRequest: vi.fn().mockResolvedValue(undefined),
    cancelTransportRequest: vi.fn().mockResolvedValue(undefined),
    fetchFleet: vi.fn().mockResolvedValue([]),
    fetchBinInventory: vi.fn().mockResolvedValue([]),
    fetchTransportRequests: vi.fn().mockResolvedValue([]),
    fetchTransportHistory: vi.fn().mockResolvedValue([]),
    fetchLogisticsSummary: vi.fn().mockResolvedValue({}),
    createTransportRequest: vi.fn().mockResolvedValue(undefined),
}));

// --- Mocks de componentes UI ---
vi.mock('@/components/ui/FilterBar', () => ({
    default: ({ searchPlaceholder, onSearchChange }: { searchPlaceholder: string; onSearchChange: (v: string) => void }) => (
        <input
            data-testid="filter-bar"
            placeholder={searchPlaceholder}
            onChange={(e) => onSearchChange(e.target.value)}
        />
    ),
}));

vi.mock('@/components/ui/EmptyState', () => ({
    default: ({ title }: { title: string }) => (
        <div data-testid="empty-state">{title}</div>
    ),
}));

vi.mock('@/components/ui/InlineSelect', () => ({
    default: ({ value, disabled }: { value: string; disabled?: boolean }) => (
        <span data-testid="inline-select" data-disabled={disabled ? 'true' : 'false'}>{value}</span>
    ),
}));

vi.mock('@/components/ui/InlineEdit', () => ({
    default: ({ value, disabled }: { value: string; disabled?: boolean }) => (
        <span data-testid="inline-edit" data-disabled={disabled ? 'true' : 'false'}>{value}</span>
    ),
}));

import FleetTab from './FleetTab';
import RequestsTab from './RequestsTab';
import BinsTab from './BinsTab';
import HistoryTab from './HistoryTab';
import RoutesTab from './RoutesTab';

// --- Fixtures ---
const makeTractor = (id: string) => ({
    id,
    name: `Tractor ${id}`,
    status: 'active' as const,
    zone: 'A1',
    driver_name: 'John',
    bins_loaded: 5,
    max_capacity: 20,
    load_status: 'partial' as const,
    last_update: '2026-04-14T08:00:00Z',
});

const makeRequest = (id: string, status: 'pending' | 'assigned' | 'completed') => ({
    id,
    status,
    priority: 'high' as const,
    zone: 'A1',
    bins_count: 5,
    requester_name: 'Alice',
    created_at: '2026-04-14T08:00:00Z',
    updated_at: '2026-04-14T08:00:00Z',
    assigned_tractor: status === 'assigned' ? 'Tractor 1' : null,
    notes: null,
});

const makeBin = (id: string) => ({
    id,
    bin_code: `BIN-${id}`,
    zone: 'A1',
    status: 'filling' as const,
    fill_percentage: 50,
});

const makeLog = (id: string) => ({
    id,
    tractor_name: 'Tractor Alpha',
    driver_name: 'John',
    from_zone: 'A1',
    to_zone: 'Warehouse',
    bins_count: 10,
    duration_minutes: 8,
    started_at: '2026-04-14T08:00:00Z',
});

const makeSummary = () => ({
    emptyBins: 10,
    fullBins: 5,
    binsInTransit: 3,
    activeTractors: 2,
    pendingRequests: 1,
});

beforeEach(() => vi.clearAllMocks());

// ============================================================
// FleetTab — tiene InlineEdit (asignacion de driver) e InlineSelect (estado)
// ============================================================
describe('FleetTab — readOnly=true', () => {
    const tractors = [makeTractor('t1'), makeTractor('t2')];

    it('renders without crashing', () => {
        render(<FleetTab tractors={tractors} readOnly />);
        expect(screen.getByText('Orchard Zone Map')).toBeTruthy();
    });

    it('shows the Read-only badge', () => {
        render(<FleetTab tractors={tractors} readOnly />);
        expect(screen.getByText('Read-only')).toBeTruthy();
    });

    it('passes disabled=true to InlineEdit (driver assignment)', () => {
        render(<FleetTab tractors={tractors} readOnly />);
        const edits = screen.getAllByTestId('inline-edit');
        edits.forEach(el => {
            expect(el.getAttribute('data-disabled')).toBe('true');
        });
    });

    it('passes disabled=true to InlineSelect (status change)', () => {
        render(<FleetTab tractors={tractors} readOnly />);
        const selects = screen.getAllByTestId('inline-select');
        selects.forEach(el => {
            expect(el.getAttribute('data-disabled')).toBe('true');
        });
    });

    it('does NOT show Read-only badge when readOnly=false', () => {
        render(<FleetTab tractors={tractors} />);
        expect(screen.queryByText('Read-only')).toBeNull();
    });
});

// ============================================================
// RequestsTab — tiene Assign Vehicle, Mark Completed, Cancel
// ============================================================
describe('RequestsTab — readOnly=true', () => {
    const requests = [
        makeRequest('r1', 'pending'),
        makeRequest('r2', 'assigned'),
        makeRequest('r3', 'completed'),
    ];
    const tractors = [makeTractor('t1')];

    it('renders without crashing', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        expect(screen.queryByTestId('filter-bar')).toBeTruthy();
    });

    it('shows the Read-only badge', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        expect(screen.getByText('Read-only')).toBeTruthy();
    });

    it('hides the Assign Vehicle button', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        expect(screen.queryByRole('button', { name: /assign vehicle/i })).toBeNull();
    });

    it('hides the Mark Completed button', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        expect(screen.queryByRole('button', { name: /complete/i })).toBeNull();
    });

    it('hides the Cancel request button', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        expect(screen.queryByTitle('Cancel Request')).toBeNull();
    });

    it('still renders request cards (data is visible)', () => {
        render(<RequestsTab requests={requests} tractors={tractors} readOnly />);
        // Zone A1 aparece en cada card
        const zones = screen.getAllByText('Zone A1');
        expect(zones.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT show Read-only badge when readOnly=false', () => {
        render(<RequestsTab requests={requests} tractors={tractors} />);
        expect(screen.queryByText('Read-only')).toBeNull();
    });
});

// ============================================================
// BinsTab — solo display, sin controles de escritura → sin cambios
// ============================================================
describe('BinsTab — display-only (no readOnly prop)', () => {
    const bins = [makeBin('b1'), makeBin('b2')];
    const summary = makeSummary();

    it('renders without crashing', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.getByText('Bin Inventory Overview')).toBeTruthy();
    });

    it('has no action buttons', () => {
        render(<BinsTab bins={bins} summary={summary} />);
        expect(screen.queryByRole('button', { name: /assign|request|create|complete|dispatch/i })).toBeNull();
    });
});

// ============================================================
// HistoryTab — solo display, sin controles de escritura → sin cambios
// ============================================================
describe('HistoryTab — display-only (no readOnly prop)', () => {
    const history = [makeLog('l1'), makeLog('l2')];

    it('renders without crashing', () => {
        render(<HistoryTab history={history} />);
        expect(screen.getByText("Today's Transport Log")).toBeTruthy();
    });

    it('has no action buttons', () => {
        render(<HistoryTab history={history} />);
        expect(screen.queryByRole('button', { name: /assign|request|create|complete|dispatch/i })).toBeNull();
    });
});

// ============================================================
// RoutesTab — botón "Plan New Route" ya viene permanentemente disabled
// → sin controles reales de escritura, sin readOnly prop
// ============================================================
describe('RoutesTab — display-only (no readOnly prop)', () => {
    it('renders without crashing', () => {
        render(<RoutesTab />);
        expect(screen.getByText('Route Planning')).toBeTruthy();
    });

    it('the Plan New Route button is already permanently disabled', () => {
        render(<RoutesTab />);
        const btn = screen.getByRole('button', { name: /plan new route/i });
        expect(btn).toBeTruthy();
        expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
});
