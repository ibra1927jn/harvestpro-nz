/**
 * RatesStep — paso 3: precio, variedad principal y hora de inicio
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RatesStep from './RatesStep';
import { VARIETIES } from './wizard.types';
import { sampleWizardData } from './testData';

describe('RatesStep', () => {
    it('shows the current values and suggests the known varieties', () => {
        const { container } = render(<RatesStep data={sampleWizardData} onUpdate={() => {}} />);
        expect((screen.getByLabelText('Primary Variety') as HTMLInputElement).value).toBe('Lapin');
        expect((screen.getByLabelText('Piece Rate ($/bucket)') as HTMLInputElement).value).toBe('1.85');
        expect((screen.getByLabelText('Default Start Time') as HTMLInputElement).value).toBe('06:30');
        expect(container.querySelectorAll('#wizard-rate-varieties option')).toHaveLength(VARIETIES.length);
    });

    it('accepts any variety typed (not only the cherry list)', () => {
        const onUpdate = vi.fn();
        render(<RatesStep data={sampleWizardData} onUpdate={onUpdate} />);
        fireEvent.change(screen.getByLabelText('Primary Variety'), { target: { value: 'Royal Gala' } });
        expect(onUpdate).toHaveBeenCalledWith('variety', 'Royal Gala');
    });

    it('piece rate: number, 0 when not a number', () => {
        const onUpdate = vi.fn();
        render(<RatesStep data={sampleWizardData} onUpdate={onUpdate} />);
        const rate = screen.getByLabelText('Piece Rate ($/bucket)');
        fireEvent.change(rate, { target: { value: '2.35' } });
        expect(onUpdate).toHaveBeenCalledWith('piece_rate', 2.35);
        fireEvent.change(rate, { target: { value: 'abc' } });
        expect(onUpdate).toHaveBeenCalledWith('piece_rate', 0);
        fireEvent.change(screen.getByLabelText('Default Start Time'), { target: { value: '07:15' } });
        expect(onUpdate).toHaveBeenCalledWith('start_time', '07:15');
    });
});
