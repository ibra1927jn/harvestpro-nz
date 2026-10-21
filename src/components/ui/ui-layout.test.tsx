/**
 * Tests for UI layout components: Drawer, FilterBar, PageHeader, TabGroup
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Drawer ──────────────────────────────────────────
import Drawer from './Drawer';

describe('Drawer', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <Drawer isOpen={false} onClose={vi.fn()}>
                <p>Hidden Content</p>
            </Drawer>,
        );
        expect(container.textContent).toBe('');
    });

    it('renders children when open', () => {
        render(
            <Drawer isOpen={true} onClose={vi.fn()}>
                <p>Drawer Content</p>
            </Drawer>,
        );
        expect(screen.getByText('Drawer Content')).toBeTruthy();
    });

    it('has dialog role and aria-modal', () => {
        render(
            <Drawer isOpen={true} onClose={vi.fn()}>
                <p>Test</p>
            </Drawer>,
        );
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('renders title and close button when title provided', () => {
        render(
            <Drawer isOpen={true} onClose={vi.fn()} title="Settings">
                <p>Body</p>
            </Drawer>,
        );
        expect(screen.getByText('Settings')).toBeTruthy();
        expect(screen.getByLabelText('Close panel')).toBeTruthy();
    });

    it('renders icon when provided', () => {
        render(
            <Drawer isOpen={true} onClose={vi.fn()} title="Info" icon="info">
                <p>Body</p>
            </Drawer>,
        );
        expect(screen.getByText('info')).toBeTruthy();
    });

    it('calls onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(
            <Drawer isOpen={true} onClose={onClose} title="Panel">
                <p>Body</p>
            </Drawer>,
        );
        fireEvent.click(screen.getByLabelText('Close panel'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose on Escape key', () => {
        const onClose = vi.fn();
        render(
            <Drawer isOpen={true} onClose={onClose}>
                <p>Content</p>
            </Drawer>,
        );
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop clicked', () => {
        const onClose = vi.fn();
        render(
            <Drawer isOpen={true} onClose={onClose}>
                <p>Content</p>
            </Drawer>,
        );
        // El backdrop es hermano del panel (role=dialog), no parte del diálogo
        const dialog = screen.getByRole('dialog');
        const backdrop = dialog.parentElement?.querySelector('.bg-black\\/40');
        expect(backdrop).toBeTruthy();
        fireEvent.click(backdrop!);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('locks body scroll when open', () => {
        render(
            <Drawer isOpen={true} onClose={vi.fn()}>
                <p>Content</p>
            </Drawer>,
        );
        expect(document.body.style.overflow).toBe('hidden');
    });
});

// ── FilterBar ───────────────────────────────────────
import FilterBar from './FilterBar';

describe('FilterBar', () => {
    const defaultProps = {
        searchValue: '',
        onSearchChange: vi.fn(),
        searchPlaceholder: 'Search employees...',
        filters: [
            { key: 'role', label: 'Role', options: ['team_leader', 'runner', 'manager'] },
            { key: 'status', label: 'Status', options: ['active', 'on_leave'] },
        ],
        activeFilters: {} as Record<string, string>,
        onFilterChange: vi.fn(),
        onClearAll: vi.fn(),
    };

    it('renders search input with placeholder', () => {
        render(<FilterBar {...defaultProps} />);
        expect(screen.getByPlaceholderText('Search employees...')).toBeTruthy();
    });

    it('renders filter dropdown buttons', () => {
        render(<FilterBar {...defaultProps} />);
        expect(screen.getByText('Role')).toBeTruthy();
        expect(screen.getByText('Status')).toBeTruthy();
    });

    it('calls onSearchChange when typing in search', () => {
        const onSearchChange = vi.fn();
        render(<FilterBar {...defaultProps} onSearchChange={onSearchChange} />);
        fireEvent.change(screen.getByPlaceholderText('Search employees...'), {
            target: { value: 'John' },
        });
        expect(onSearchChange).toHaveBeenCalledWith('John');
    });

    it('shows Clear button when search has value', () => {
        render(<FilterBar {...defaultProps} searchValue="test" />);
        expect(screen.getByText('Clear')).toBeTruthy();
    });

    it('hides Clear button when no active filters', () => {
        render(<FilterBar {...defaultProps} searchValue="" activeFilters={{}} />);
        expect(screen.queryByText('Clear')).toBeNull();
    });

    it('calls onClearAll when Clear button clicked', () => {
        const onClearAll = vi.fn();
        render(<FilterBar {...defaultProps} searchValue="test" onClearAll={onClearAll} />);
        fireEvent.click(screen.getByText('Clear'));
        expect(onClearAll).toHaveBeenCalledOnce();
    });

    it('shows active filter pills', () => {
        render(
            <FilterBar
                {...defaultProps}
                activeFilters={{ role: 'team_leader' }}
            />,
        );
        // "team leader" appears in both dropdown button and active pill
        const matches = screen.getAllByText('team leader');
        expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('opens dropdown on filter button click', () => {
        render(<FilterBar {...defaultProps} />);
        fireEvent.click(screen.getByText('Role'));
        expect(screen.getByText('All Roles')).toBeTruthy();
        expect(screen.getByText('team leader')).toBeTruthy();
    });

    it('shows search value pill in Active summary', () => {
        render(<FilterBar {...defaultProps} searchValue="Maria" />);
        expect(screen.getByText('"Maria"')).toBeTruthy();
    });

    describe('options with label and count (fixed domain)', () => {
        const filters = [{
            key: 'status', label: 'Status', options: [
                { value: 'active', count: 12 },
                { value: 'on_leave', count: 0 },
                { value: 'custom', label: 'Custom label', count: 3 },
            ],
        }];

        it('shows every option of the domain with its count, 0 greyed out but selectable', () => {
            const onFilterChange = vi.fn();
            render(<FilterBar {...defaultProps} filters={filters} onFilterChange={onFilterChange} />);
            fireEvent.click(screen.getByText('Status'));
            expect(screen.getByText('(12)')).toBeTruthy();
            const empty = screen.getByText('On leave').closest('button')!;
            expect(empty.className).toContain('text-text-muted');
            expect(empty.getAttribute('data-count')).toBe('0');
            fireEvent.click(empty);
            expect(onFilterChange).toHaveBeenCalledWith('status', 'on_leave');
        });

        it('uses the custom label in the dropdown, the button and the active pill', () => {
            render(<FilterBar {...defaultProps} filters={filters} activeFilters={{ status: 'custom' }} />);
            // Botón del filtro + píldora de filtros activos
            expect(screen.getAllByText('Custom label').length).toBe(2);
            fireEvent.click(screen.getAllByText('Custom label')[0]);
            expect(screen.getAllByText('Custom label').length).toBe(3);
            expect(screen.getByText('(3)')).toBeTruthy();
        });
    });
});

// ── PageHeader ──────────────────────────────────────
import PageHeader from './PageHeader';

describe('PageHeader', () => {
    it('renders icon and title', () => {
        render(<PageHeader icon="dashboard" title="Dashboard" />);
        expect(screen.getByText('dashboard')).toBeTruthy();
        expect(screen.getByText('Dashboard')).toBeTruthy();
    });

    it('renders subtitle when provided', () => {
        render(<PageHeader icon="people" title="Team" subtitle="Manage your team" />);
        expect(screen.getByText('Manage your team')).toBeTruthy();
    });

    it('does not render subtitle when absent', () => {
        render(<PageHeader icon="people" title="Team" />);
        expect(screen.queryByText('Manage your team')).toBeNull();
    });

    it('renders badges', () => {
        render(
            <PageHeader
                icon="star"
                title="Ratings"
                badges={[
                    { label: 'Active', icon: 'check', color: 'emerald' },
                    { label: '5 Alerts', icon: 'warning', color: 'amber' },
                ]}
            />,
        );
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.getByText('5 Alerts')).toBeTruthy();
    });

    it('renders action slot', () => {
        render(
            <PageHeader
                icon="settings"
                title="Settings"
                action={<button>Save</button>}
            />,
        );
        expect(screen.getByText('Save')).toBeTruthy();
    });

    it('renders children alongside action', () => {
        render(
            <PageHeader
                icon="view"
                title="Views"
                action={<button>Export</button>}
            >
                <span>Toggle</span>
            </PageHeader>,
        );
        expect(screen.getByText('Toggle')).toBeTruthy();
        expect(screen.getByText('Export')).toBeTruthy();
    });

    it('does not render right section when no action or children', () => {
        const { container } = render(<PageHeader icon="star" title="Simple" />);
        // Only the left section should be present
        expect(container.querySelectorAll('h1')).toHaveLength(1);
    });
});

// ── TabGroup ────────────────────────────────────────
import TabGroup from './TabGroup';

describe('TabGroup', () => {
    const tabs = [
        { key: 'overview', label: 'Overview' },
        { key: 'details', label: 'Details', icon: 'info' },
        { key: 'alerts', label: 'Alerts', badge: 5 },
    ];

    it('renders all tab labels', () => {
        render(<TabGroup tabs={tabs} activeTab="overview" onChange={vi.fn()} />);
        expect(screen.getByText('Overview')).toBeTruthy();
        expect(screen.getByText('Details')).toBeTruthy();
        expect(screen.getByText('Alerts')).toBeTruthy();
    });

    it('has tablist role', () => {
        render(<TabGroup tabs={tabs} activeTab="overview" onChange={vi.fn()} />);
        expect(screen.getByRole('tablist')).toBeTruthy();
    });

    it('marks active tab with aria-selected', () => {
        render(<TabGroup tabs={tabs} activeTab="details" onChange={vi.fn()} />);
        const allTabs = screen.getAllByRole('tab');
        const detailsTab = allTabs.find(t => t.textContent?.includes('Details'));
        expect(detailsTab?.getAttribute('aria-selected')).toBe('true');
    });

    it('calls onChange when tab clicked', () => {
        const onChange = vi.fn();
        render(<TabGroup tabs={tabs} activeTab="overview" onChange={onChange} />);
        fireEvent.click(screen.getByText('Details'));
        expect(onChange).toHaveBeenCalledWith('details');
    });

    it('renders tab icon', () => {
        render(<TabGroup tabs={tabs} activeTab="overview" onChange={vi.fn()} />);
        expect(screen.getByText('info')).toBeTruthy();
    });

    it('renders badge count', () => {
        render(<TabGroup tabs={tabs} activeTab="overview" onChange={vi.fn()} />);
        expect(screen.getByText('5')).toBeTruthy();
    });

    it('shows 99+ for badges over 99', () => {
        const bigBadge = [{ key: 'alerts', label: 'Alerts', badge: 150 }];
        render(<TabGroup tabs={bigBadge} activeTab="overview" onChange={vi.fn()} />);
        expect(screen.getByText('99+')).toBeTruthy();
    });

    it('does not render badge when 0', () => {
        const zeroBadge = [{ key: 'test', label: 'Test', badge: 0 }];
        render(<TabGroup tabs={zeroBadge} activeTab="test" onChange={vi.fn()} />);
        expect(screen.queryByText('0')).toBeNull();
    });

    it('applies pill variant styles', () => {
        const { container } = render(
            <TabGroup tabs={tabs} activeTab="overview" onChange={vi.fn()} variant="pill" />,
        );
        expect(container.querySelector('.bg-slate-100')).toBeTruthy();
    });
});
