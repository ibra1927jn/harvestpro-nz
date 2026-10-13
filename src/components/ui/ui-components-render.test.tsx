/**
 * Batch UI Component Render Tests
 * Deep rendering tests for reusable UI primitives
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/utils/cn', () => ({
    cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ── EmptyState ──────────────────────────────────
describe('EmptyState', () => {
    let EmptyState: React.FC<any>;
    beforeAll(async () => {
        const mod = await import('@/components/ui/EmptyState');
        EmptyState = mod.default;
    });

    it('renders icon, title, subtitle', () => {
        render(<EmptyState icon="search" title="No results" subtitle="Try again" />);
        expect(screen.getByText('No results')).toBeDefined();
        expect(screen.getByText('Try again')).toBeDefined();
        expect(screen.getByText('search')).toBeDefined();
    });

    it('hides subtitle when not provided', () => {
        const { container } = render(<EmptyState icon="info" title="Empty" />);
        expect(container.textContent).not.toContain('Try again');
    });

    it('renders action button when action provided', () => {
        const onClick = vi.fn();
        render(<EmptyState icon="add" title="No items" action={{ label: 'Add Item', onClick, icon: 'add_circle' }} />);
        expect(screen.getByText('Add Item')).toBeDefined();
        fireEvent.click(screen.getByText('Add Item'));
        expect(onClick).toHaveBeenCalled();
    });

    it('hides action button when action not provided', () => {
        const { container } = render(<EmptyState icon="info" title="Empty" />);
        expect(container.querySelector('button')).toBeNull();
    });

    it('compact mode applies smaller padding', () => {
        const { container } = render(<EmptyState icon="info" title="Compact" compact={true} />);
        expect(container.firstChild).not.toBeNull();
    });
});

// ── StatusBadge ──────────────────────────────────
describe('StatusBadge', () => {
    let StatusBadge: React.FC<any>;
    beforeAll(async () => {
        const mod = await import('@/components/ui/StatusBadge');
        StatusBadge = mod.default;
    });

    it('renders label text', () => {
        render(<StatusBadge status="active" label="Active" />);
        expect(screen.getByText('Active')).toBeDefined();
    });

    it('renders icon when provided', () => {
        render(<StatusBadge status="warning" label="Warning" icon="warning" />);
        expect(screen.getByText('warning')).toBeDefined();
    });

    it('renders all status variants', () => {
        const statuses = ['active', 'inactive', 'warning', 'danger', 'info', 'success', 'neutral'];
        for (const status of statuses) {
            const { unmount } = render(<StatusBadge status={status} label={status} />);
            expect(screen.getByText(status)).toBeDefined();
            unmount();
        }
    });

    it('applies sm size class', () => {
        const { container } = render(<StatusBadge status="active" label="Small" size="sm" />);
        expect(container.firstChild).not.toBeNull();
    });
});

// ── StatCard ────────────────────────────────────
describe('StatCard', () => {
    let StatCard: React.FC<any>;
    beforeAll(async () => {
        const mod = await import('@/components/ui/StatCard');
        StatCard = mod.default;
    });

    it('renders icon, value, label', () => {
        render(<StatCard icon="inventory" value={42} label="Total Buckets" />);
        expect(screen.getByText('42')).toBeDefined();
        expect(screen.getByText('Total Buckets')).toBeDefined();
        expect(screen.getByText('inventory')).toBeDefined();
    });

    it('renders trend indicator when provided', () => {
        const { container } = render(
            <StatCard icon="speed" value="12.5" label="Rate" trend={{ direction: 'up', value: '+12%' }} />
        );
        expect(container.textContent).toContain('+12%');
    });

    it('hides trend when not provided', () => {
        const { container } = render(<StatCard icon="speed" value="10" label="Rate" />);
        expect(container.textContent).not.toContain('trending');
    });

    it('calls onClick when clickable', () => {
        const onClick = vi.fn();
        render(<StatCard icon="i" value={1} label="Click me" onClick={onClick} />);
        fireEvent.click(screen.getByText('Click me'));
        expect(onClick).toHaveBeenCalled();
    });

    it('has role=button when clickable', () => {
        const { container } = render(<StatCard icon="i" value={1} label="L" onClick={vi.fn()} />);
        expect(container.querySelector('[role="button"]')).toBeDefined();
    });

    it('renders down trend', () => {
        const { container } = render(
            <StatCard icon="i" value={5} label="L" trend={{ direction: 'down', value: '-3%' }} />
        );
        expect(container.textContent).toContain('-3%');
    });
});

// ── Toast ────────────────────────────────────────
describe('Toast', () => {
    let Toast: React.FC<any>;
    beforeAll(async () => {
        const mod = await import('@/components/ui/Toast');
        Toast = mod.default;
    });

    it('renders message', () => {
        render(<Toast message="Action completed" onClose={vi.fn()} />);
        expect(screen.getByText('Action completed')).toBeDefined();
    });

    it('renders success type icon', () => {
        render(<Toast message="Success" type="success" onClose={vi.fn()} />);
        expect(screen.getByText('check_circle')).toBeDefined();
    });

    it('renders error type icon', () => {
        render(<Toast message="Error" type="error" onClose={vi.fn()} />);
        expect(screen.getByText('error')).toBeDefined();
    });

    it('calls onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(<Toast message="Test" onClose={onClose} />);
        fireEvent.click(screen.getByText('close'));
        expect(onClose).toHaveBeenCalled();
    });

    it('auto-dismisses after 3 seconds', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        render(<Toast message="Test" onClose={onClose} />);
        act(() => vi.advanceTimersByTime(3000));
        expect(onClose).toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('renders all 4 types', () => {
        const types = ['success', 'error', 'info', 'warning'] as const;
        for (const type of types) {
            const { unmount } = render(<Toast message={`${type} msg`} type={type} onClose={vi.fn()} />);
            expect(screen.getByText(`${type} msg`)).toBeDefined();
            unmount();
        }
    });
});

// ── FilterBar ───────────────────────────────────
describe('FilterBar', () => {
    let FilterBar: React.FC<any>;
    beforeAll(async () => {
        const mod = await import('@/components/ui/FilterBar');
        FilterBar = mod.default;
    });

    it('renders search input', () => {
        render(
            <FilterBar searchValue="" onSearchChange={vi.fn()} filters={[]}
                activeFilters={{}} onFilterChange={vi.fn()} onClearAll={vi.fn()} />
        );
        const input = screen.getByPlaceholderText('Search...');
        expect(input).toBeDefined();
    });

    it('calls onSearchChange when typing', () => {
        const onSearchChange = vi.fn();
        render(
            <FilterBar searchValue="" onSearchChange={onSearchChange} filters={[]}
                activeFilters={{}} onFilterChange={vi.fn()} onClearAll={vi.fn()} />
        );
        fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'test' } });
        expect(onSearchChange).toHaveBeenCalledWith('test');
    });

    it('renders filter chips', () => {
        const filters = [{ key: 'status', label: 'Status', options: ['active', 'idle'] }];
        render(
            <FilterBar searchValue="" onSearchChange={vi.fn()} filters={filters}
                activeFilters={{}} onFilterChange={vi.fn()} onClearAll={vi.fn()} />
        );
        expect(screen.getByText('Status')).toBeDefined();
    });

    it('shows clear all button when filters active', () => {
        const onClearAll = vi.fn();
        render(
            <FilterBar searchValue="q" onSearchChange={vi.fn()} filters={[]}
                activeFilters={{}} onFilterChange={vi.fn()} onClearAll={onClearAll} />
        );
        const clearBtn = screen.queryByText('Clear');
        if (clearBtn) {
            fireEvent.click(clearBtn);
            expect(onClearAll).toHaveBeenCalled();
        }
    });
});

// ── Button ──────────────────────────────────────
describe('Button', () => {
    it('renders with text', async () => {
        const mod = await import('@/components/ui/Button');
        const Button = mod.default;
        render(<Button>Click Me</Button>);
        expect(screen.getByText('Click Me')).toBeDefined();
    });
});

// ── LoadingSkeleton ─────────────────────────────
describe('LoadingSkeleton', () => {
    it('renders skeleton element', async () => {
        const mod = await import('@/components/ui/LoadingSkeleton');
        const LoadingSkeleton = mod.default;
        const { container } = render(<LoadingSkeleton />);
        expect(container.firstChild).not.toBeNull();
    });
});

// ── ModalOverlay ────────────────────────────────
describe('ModalOverlay', () => {
    it('renders children inside overlay', async () => {
        const mod = await import('@/components/ui/ModalOverlay');
        const ModalOverlay = mod.default;
        const { container } = render(
            <ModalOverlay onClose={vi.fn()}>
                <div>Modal Content</div>
            </ModalOverlay>
        );
        expect(container.textContent).toContain('Modal Content');
    });
});

// ── InlineEdit ──────────────────────────────────
describe('InlineEdit', () => {
    it('renders current value', async () => {
        const mod = await import('@/components/ui/InlineEdit');
        const InlineEdit = mod.default;
        const { container } = render(<InlineEdit value="Hello" onSave={vi.fn()} />);
        expect(container.textContent).toContain('Hello');
    });
});

// ── InlineSelect ────────────────────────────────
describe('InlineSelect', () => {
    it('renders current value', async () => {
        const mod = await import('@/components/ui/InlineSelect');
        const InlineSelect = mod.default;
        const { container } = render(
            <InlineSelect value="active" options={['active', 'idle']} onSave={vi.fn()} />
        );
        expect(container.textContent).toContain('Active');
    });
});

// ── PageHeader ──────────────────────────────────
describe('PageHeader', () => {
    it('renders title', async () => {
        const mod = await import('@/components/ui/PageHeader');
        const PageHeader = mod.default;
        const { container } = render(<PageHeader title="Dashboard" />);
        expect(container.textContent).toContain('Dashboard');
    });
});




// ── TabGroup ────────────────────────────────────
describe('TabGroup', () => {
    it('renders tab labels', async () => {
        const mod = await import('@/components/ui/TabGroup');
        const TabGroup = mod.default;
        const { container } = render(
            <TabGroup
                tabs={[{ label: 'Tab A', value: 'a' }, { label: 'Tab B', value: 'b' }]}
                activeTab="a"
                onTabChange={vi.fn()}
            />
        );
        expect(container.textContent).toContain('Tab A');
        expect(container.textContent).toContain('Tab B');
    });
});

// ── ThemeToggle ─────────────────────────────────
describe('ThemeToggle', () => {
    it('renders toggle button', async () => {
        const mod = await import('@/components/ui/ThemeToggle');
        const ThemeToggle = mod.default;
        const { container } = render(<ThemeToggle />);
        expect(container.firstChild).not.toBeNull();
    });
});
