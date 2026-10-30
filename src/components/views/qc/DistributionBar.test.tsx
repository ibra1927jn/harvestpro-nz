/**
 * DistributionBar — QC Grade Distribution stacked bar.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DistributionBar from './DistributionBar';

describe('DistributionBar', () => {
    it('no renderiza nada cuando total === 0', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 0, B: 0, C: 0, reject: 0, total: 0 }} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renderiza 4 segmentos con counts > 0', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 10, B: 5, C: 3, reject: 2, total: 20 }} />,
        );
        const segments = container.querySelectorAll('.bg-green-500, .bg-blue-500, .bg-amber-500, .bg-red-500');
        expect(segments).toHaveLength(4);
    });

    it('omite segmentos con count=0', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 10, B: 0, C: 0, reject: 0, total: 10 }} />,
        );
        expect(container.querySelector('.bg-green-500')).not.toBeNull();
        expect(container.querySelector('.bg-blue-500')).toBeNull();
        expect(container.querySelector('.bg-amber-500')).toBeNull();
        expect(container.querySelector('.bg-red-500')).toBeNull();
    });

    it('large=true aplica h-6 (default h-3)', () => {
        const { container } = render(
            <DistributionBar large distribution={{ A: 1, B: 0, C: 0, reject: 0, total: 1 }} />,
        );
        expect(container.firstChild).toHaveClass('h-6');
    });

    it('large=false (default) aplica h-3', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 1, B: 0, C: 0, reject: 0, total: 1 }} />,
        );
        expect(container.firstChild).toHaveClass('h-3');
    });

    it('computa el width relativo basado en total', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 5, B: 0, C: 0, reject: 0, total: 10 }} />,
        );
        const green = container.querySelector('.bg-green-500') as HTMLElement;
        // Usa CSS var --w = 50%
        expect(green.getAttribute('style')).toContain('50%');
    });

    it('segmento reject usa la etiqueta de la inspección del picker ("Severe", no "Grade reject")', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 0, B: 0, C: 0, reject: 5, total: 5 }} />,
        );
        const red = container.querySelector('.bg-red-500');
        expect(red?.getAttribute('title')).toBe('Severe: 5');
    });

    it('segmento A usa la etiqueta "Good"', () => {
        const { container } = render(
            <DistributionBar distribution={{ A: 3, B: 0, C: 0, reject: 0, total: 3 }} />,
        );
        const green = container.querySelector('.bg-green-500');
        expect(green?.getAttribute('title')).toBe('Good: 3');
    });
});
