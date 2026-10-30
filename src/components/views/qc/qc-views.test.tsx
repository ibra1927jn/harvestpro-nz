/**
 * Tests for QC view components — DistributionBar
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DistributionBar from './DistributionBar';

describe('DistributionBar', () => {
    it('renders nothing when total is 0', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 0, B: 0, C: 0, reject: 0, total: 0 }} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders bar segments for non-zero grades', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 10, B: 5, C: 3, reject: 2, total: 20 }} />
        );
        const segments = container.querySelectorAll('[title]');
        expect(segments.length).toBe(4); // A, B, C, reject all > 0
    });

    it('shows correct titles for segments', () => {
        render(
            <DistributionBar distribution={{ A: 10, B: 5, C: 0, reject: 1, total: 16 }} />
        );
        expect(screen.getByTitle('Good: 10')).toBeTruthy();
        expect(screen.getByTitle('Acceptable: 5')).toBeTruthy();
        expect(screen.getByTitle('Severe: 1')).toBeTruthy();
    });

    it('skips zero-count segments', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 10, B: 0, C: 0, reject: 0, total: 10 }} />
        );
        const segments = container.querySelectorAll('[title]');
        expect(segments.length).toBe(1); // only A
    });

    it('applies large variant styling', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 5, B: 5, C: 0, reject: 0, total: 10 }} large />
        );
        expect(container.querySelector('.h-6')).toBeTruthy();
    });

    it('applies default small styling', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 5, B: 5, C: 0, reject: 0, total: 10 }} />
        );
        expect(container.querySelector('.h-3')).toBeTruthy();
    });
});
