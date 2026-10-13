/**
 * Tests for auth/login sub-components: Decorations, HeroPanel
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Decorations ─────────────────────────────────────
import { VineLeaf, GrapeCluster, ParticleDots } from './Decorations';

describe('VineLeaf', () => {
    it('renders an SVG', () => {
        const { container } = render(<VineLeaf />);
        expect(container.querySelector('svg')).toBeTruthy();
    });

    it('applies className', () => {
        const { container } = render(<VineLeaf className="custom-class" />);
        expect(container.querySelector('svg')?.className.baseVal).toContain('custom-class');
    });
});

describe('GrapeCluster', () => {
    it('renders an SVG with circles', () => {
        const { container } = render(<GrapeCluster />);
        expect(container.querySelector('svg')).toBeTruthy();
        expect(container.querySelectorAll('circle').length).toBeGreaterThan(0);
    });
});

describe('ParticleDots', () => {
    it('renders 18 particle dots', () => {
        const { container } = render(<ParticleDots />);
        const dots = container.querySelectorAll('.rounded-full');
        expect(dots.length).toBe(18);
    });
});

// ── HeroPanel ───────────────────────────────────────
// Mock animation hooks
vi.mock('@/hooks/useLoginAnimations', () => ({
    useTypewriter: () => ({ displayed: 'Manage your harvest intelligently', done: true }),
    useCounter: (target: number) => target,
    useParallax: () => ({ ref: { current: null }, offset: { x: 0, y: 0 } }),
}));

import HeroPanel from './HeroPanel';

describe('HeroPanel', () => {
    it('renders brand name', () => {
        render(<HeroPanel />);
        expect(screen.getByText('HarvestPro')).toBeTruthy();
    });

    it('renders hero title', () => {
        render(<HeroPanel />);
        expect(screen.getByText(/intelligently/)).toBeTruthy();
    });

    it('renders trust badges', () => {
        render(<HeroPanel />);
        const rlsBadges = screen.getAllByText('RLS Secured');
        expect(rlsBadges.length).toBeGreaterThanOrEqual(1);
        const syncBadges = screen.getAllByText('Real-Time Sync');
        expect(syncBadges.length).toBeGreaterThanOrEqual(1);
        const nzBadges = screen.getAllByText('NZ Compliant');
        expect(nzBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('renders counter stats', () => {
        render(<HeroPanel />);
        expect(screen.getByText('8')).toBeTruthy();  // roles counter
        expect(screen.getByText('24/7')).toBeTruthy(); // offline-first
    });
});
