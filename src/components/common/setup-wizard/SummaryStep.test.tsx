/**
 * SummaryStep — paso 4: revisar antes de crear
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryStep from './SummaryStep';
import { sampleWizardData } from './testData';

describe('SummaryStep', () => {
    it('lists orchard, total rows from the blocks, season and each block', () => {
        render(<SummaryStep data={sampleWizardData} error={null} />);
        expect(screen.getByText('JP-01')).toBeTruthy();
        expect(screen.getByText('J&P Cherries')).toBeTruthy();
        expect(screen.getByText('20')).toBeTruthy();
        expect(screen.getByText('Season: Season 2026–27')).toBeTruthy();
        expect(screen.getByText('Block A: rows 1–15, Royal Gala, 90 buckets/row')).toBeTruthy();
        // Bloque sin variedad: la principal del huerto
        expect(screen.getByText('Block B: rows 16–20, Lapin, 100 buckets/row')).toBeTruthy();
        expect(screen.getByText('$1.85/bucket')).toBeTruthy();
    });

    it('shows the error only when there is one', () => {
        const { rerender } = render(<SummaryStep data={sampleWizardData} error={null} />);
        expect(screen.queryByRole('alert')).toBeNull();
        rerender(<SummaryStep data={sampleWizardData} error="Row 5 is already in block A" />);
        expect(screen.getByRole('alert').textContent).toContain('Row 5 is already in block A');
    });
});
