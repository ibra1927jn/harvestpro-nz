/**
 * OrchardStep — paso 1 del asistente de huerto nuevo
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrchardStep from './OrchardStep';
import { sampleWizardData } from './testData';

describe('OrchardStep', () => {
    it('shows code, name and location (rows come from the blocks step)', () => {
        render(<OrchardStep data={sampleWizardData} onUpdate={() => {}} />);
        expect((screen.getByLabelText('Orchard Code *') as HTMLInputElement).value).toBe('JP-01');
        expect((screen.getByLabelText('Orchard Name *') as HTMLInputElement).value).toBe('J&P Cherries');
        expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Cromwell');
        expect(screen.queryByLabelText('Total Rows')).toBeNull();
    });

    it('upper-cases the code and passes name and location as typed', () => {
        const onUpdate = vi.fn();
        render(<OrchardStep data={sampleWizardData} onUpdate={onUpdate} />);
        fireEvent.change(screen.getByPlaceholderText('e.g. JP-01'), { target: { value: 'hb-02' } });
        fireEvent.change(screen.getByLabelText('Orchard Name *'), { target: { value: 'Hawke Bay' } });
        fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Hastings' } });
        expect(onUpdate).toHaveBeenCalledWith('code', 'HB-02');
        expect(onUpdate).toHaveBeenCalledWith('name', 'Hawke Bay');
        expect(onUpdate).toHaveBeenCalledWith('location', 'Hastings');
    });
});
