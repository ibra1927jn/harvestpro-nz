/**
 * Setup Wizard Step Components — OrchardStep, TeamsStep, RatesStep, SummaryStep tests
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./wizard.types', () => ({
    VARIETIES: ['Cherry', 'Apple', 'Kiwifruit'],
}));

import OrchardStep from './OrchardStep';
import TeamsStep from './TeamsStep';
import RatesStep from './RatesStep';
import SummaryStep from './SummaryStep';

const wizardData = {
    orchard: { code: 'JP-01', name: 'J&P Cherries', location: 'Cromwell', total_rows: 50 },
    teams: [
        { name: 'Team Alpha', leader_name: 'Carlos', max_pickers: 12 },
        { name: 'Team Beta', leader_name: '', max_pickers: 8 },
    ],
    rates: { variety: 'Cherry', piece_rate: 1.85, start_time: '06:30' },
};

describe('OrchardStep', () => {
    const onUpdate = vi.fn();

    it('renders Orchard Code label', () => {
        render(<OrchardStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByText('Orchard Code *')).toBeTruthy();
    });

    it('renders Orchard Name label', () => {
        render(<OrchardStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByText('Orchard Name *')).toBeTruthy();
    });

    it('renders Location field', () => {
        render(<OrchardStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByText('Location')).toBeTruthy();
    });

    it('renders Total Rows field', () => {
        render(<OrchardStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByLabelText('Total Rows')).toBeTruthy();
    });

    it('calls onUpdate when code changes', () => {
        render(<OrchardStep data={wizardData} onUpdate={onUpdate} />);
        const input = screen.getByPlaceholderText('e.g. JP-01');
        fireEvent.change(input, { target: { value: 'HB-02' } });
        expect(onUpdate).toHaveBeenCalledWith('code', 'HB-02');
    });
});

describe('TeamsStep', () => {
    const onUpdateTeam = vi.fn();
    const onAddTeam = vi.fn();
    const onRemoveTeam = vi.fn();

    it('renders team description', () => {
        render(<TeamsStep data={wizardData} onUpdateTeam={onUpdateTeam} onAddTeam={onAddTeam} onRemoveTeam={onRemoveTeam} />);
        expect(screen.getByText(/Define your picking teams/)).toBeTruthy();
    });

    it('renders team headers', () => {
        render(<TeamsStep data={wizardData} onUpdateTeam={onUpdateTeam} onAddTeam={onAddTeam} onRemoveTeam={onRemoveTeam} />);
        expect(screen.getByText('Team 1')).toBeTruthy();
        expect(screen.getByText('Team 2')).toBeTruthy();
    });

    it('renders Add Team button', () => {
        render(<TeamsStep data={wizardData} onUpdateTeam={onUpdateTeam} onAddTeam={onAddTeam} onRemoveTeam={onRemoveTeam} />);
        expect(screen.getByText('Add Team')).toBeTruthy();
    });

    it('calls onAddTeam when button clicked', () => {
        render(<TeamsStep data={wizardData} onUpdateTeam={onUpdateTeam} onAddTeam={onAddTeam} onRemoveTeam={onRemoveTeam} />);
        fireEvent.click(screen.getByText('Add Team'));
        expect(onAddTeam).toHaveBeenCalled();
    });

    it('shows Remove buttons when multiple teams', () => {
        render(<TeamsStep data={wizardData} onUpdateTeam={onUpdateTeam} onAddTeam={onAddTeam} onRemoveTeam={onRemoveTeam} />);
        const removeButtons = screen.getAllByText('Remove');
        expect(removeButtons.length).toBe(2);
    });
});

describe('RatesStep', () => {
    const onUpdate = vi.fn();

    it('renders rate description', () => {
        render(<RatesStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByText(/Set the default piece rate/)).toBeTruthy();
    });

    it('renders variety select', () => {
        render(<RatesStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByLabelText('Primary variety')).toBeTruthy();
    });

    it('renders piece rate input', () => {
        render(<RatesStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByLabelText('Piece Rate ($/bucket)')).toBeTruthy();
    });

    it('renders start time input', () => {
        render(<RatesStep data={wizardData} onUpdate={onUpdate} />);
        expect(screen.getByLabelText('Default Start Time')).toBeTruthy();
    });
});

describe('SummaryStep', () => {
    it('renders Orchard section', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.getByText('Orchard')).toBeTruthy();
    });

    it('renders orchard code', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.getByText('JP-01')).toBeTruthy();
    });

    it('renders orchard name', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.getByText('J&P Cherries')).toBeTruthy();
    });

    it('does not list teams (linked later in Teams)', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.queryByText(/Teams \(2\)/)).toBeNull();
    });

    it('renders Rates section', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.getByText('Rates')).toBeTruthy();
    });

    it('renders piece rate value', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.getByText('$1.85/bucket')).toBeTruthy();
    });

    it('displays error message', () => {
        render(<SummaryStep data={wizardData} error="Something went wrong" />);
        expect(screen.getByText('Something went wrong')).toBeTruthy();
    });

    it('hides error when null', () => {
        render(<SummaryStep data={wizardData} error={null} />);
        expect(screen.queryByText('Something went wrong')).toBeNull();
    });
});
