/**
 * Tests for BottomNav — Mobile bottom navigation component
 * 
 * Pure presentational component: renders tabs, handles active state, fires callbacks
 * @module components/common/BottomNav.test
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomNav from './BottomNav';
import type { NavTab } from './BottomNav';

const mockTabs: NavTab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'teams', label: 'Teams', icon: 'groups' },
    { id: 'map', label: 'Map', icon: 'map' },
    { id: 'logistics', label: 'Logistics', icon: 'local_shipping', badge: 3 },
    { id: 'more', label: 'More', icon: 'apps' },
];

describe('BottomNav', () => {
    it('renders all tabs', () => {
        render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={vi.fn()} />);
        expect(screen.getByText('Dashboard')).toBeTruthy();
        expect(screen.getByText('Teams')).toBeTruthy();
        expect(screen.getByText('Map')).toBeTruthy();
        expect(screen.getByText('Logistics')).toBeTruthy();
        expect(screen.getByText('More')).toBeTruthy();
    });

    it('highlights active tab with aria-current', () => {
        render(<BottomNav tabs={mockTabs} activeTab="teams" onTabChange={vi.fn()} />);
        const buttons = screen.getAllByRole('button');
        const teamsBtn = buttons.find(b => b.textContent?.includes('Teams'));
        expect(teamsBtn?.getAttribute('aria-current')).toBe('page');
    });

    it('does not set aria-current on inactive tabs', () => {
        render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={vi.fn()} />);
        const buttons = screen.getAllByRole('button');
        const teamsBtn = buttons.find(b => b.textContent?.includes('Teams'));
        expect(teamsBtn?.getAttribute('aria-current')).toBeNull();
    });

    it('calls onTabChange when tab is clicked', () => {
        const onTabChange = vi.fn();
        render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={onTabChange} />);
        const mapBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Map'));
        fireEvent.click(mapBtn!);
        expect(onTabChange).toHaveBeenCalledWith('map');
    });

    it('renders badge dot when badge count > 0', () => {
        const { container } = render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={vi.fn()} />);
        // The Logistics tab has badge: 3, should render badge dot
        const badgeDots = container.querySelectorAll('.bg-red-500');
        expect(badgeDots.length).toBeGreaterThanOrEqual(1);
    });

    it('does not print a stray "0" when the badge count is zero', () => {
        // Bug: {badge && ...} pintaba "0" junto al icono (visto en HR > Employees)
        render(
            <BottomNav
                tabs={[{ id: 'employees', label: 'Employees', icon: 'group', badge: 0 }]}
                activeTab="employees"
                onTabChange={vi.fn()}
            />
        );
        const button = screen.getByRole('button', { name: 'Employees' });
        expect(button.textContent).not.toContain('0');
    });

    it('renders icon text for each tab', () => {
        const { container } = render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={vi.fn()} />);
        const icons = container.querySelectorAll('.material-symbols-outlined');
        expect(icons.length).toBe(5);
    });

    it('renders with empty tabs array', () => {
        render(<BottomNav tabs={[]} activeTab="" onTabChange={vi.fn()} />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders nav element', () => {
        render(<BottomNav tabs={mockTabs} activeTab="dashboard" onTabChange={vi.fn()} />);
        expect(screen.getByRole('navigation')).toBeTruthy();
    });
});
