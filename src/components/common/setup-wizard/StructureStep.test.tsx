/**
 * StructureStep — paso 2: temporada, bloques y filas
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StructureStep from './StructureStep';
import { sampleWizardData } from './testData';

describe('StructureStep', () => {
    it('shows the season and one line per block with the total rows', () => {
        render(<StructureStep data={sampleWizardData} onSeason={() => {}} onBlocks={() => {}} />);
        expect((screen.getByTestId('wizard-season-name') as HTMLInputElement).value).toBe('Season 2026–27');
        expect(screen.getByTestId('wizard-block-0')).toBeTruthy();
        expect(screen.getByTestId('wizard-block-1')).toBeTruthy();
        expect(screen.getByText('20 rows in total')).toBeTruthy();
        expect(screen.queryByTestId('wizard-structure-error')).toBeNull();
    });

    it('adds a block that starts after the last row', () => {
        const onBlocks = vi.fn();
        render(<StructureStep data={sampleWizardData} onSeason={() => {}} onBlocks={onBlocks} />);
        fireEvent.click(screen.getByText('Add block'));
        const blocks = onBlocks.mock.calls[0][0];
        expect(blocks).toHaveLength(3);
        expect(blocks[2]).toMatchObject({ name: 'Block C', row_from: 21, row_to: 30 });
    });

    it('edits and removes a block', () => {
        const onBlocks = vi.fn();
        render(<StructureStep data={sampleWizardData} onSeason={() => {}} onBlocks={onBlocks} />);
        fireEvent.change(screen.getAllByLabelText('To row')[0], { target: { value: '12' } });
        expect(onBlocks.mock.calls[0][0][0]).toMatchObject({ row_from: 1, row_to: 12 });
        fireEvent.click(screen.getByLabelText('Remove Block B'));
        expect(onBlocks.mock.calls[1][0]).toHaveLength(1);
    });

    it('warns when two blocks share row numbers', () => {
        const data = { ...sampleWizardData, blocks: [sampleWizardData.blocks[0], { ...sampleWizardData.blocks[1], row_from: 10 }] };
        render(<StructureStep data={data} onSeason={() => {}} onBlocks={() => {}} />);
        expect(screen.getByTestId('wizard-structure-error').textContent).toMatch(/share row numbers/);
    });
});
