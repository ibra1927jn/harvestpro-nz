/**
 * SummaryStep — setup wizard step 4 (review).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SummaryStep from './SummaryStep';
import { INITIAL_DATA } from './wizard.types';

describe('SummaryStep', () => {
    const data = {
        ...INITIAL_DATA,
        orchard: { code: 'JP-01', name: 'JP Farm', location: 'Cromwell', total_rows: 20 },
        teams: [
            { name: 'Alpha', leader_name: 'Alice', max_pickers: 15 },
            { name: 'Bravo', leader_name: '', max_pickers: 10 },
        ],
        rates: { variety: 'Lapin', piece_rate: 1.8, start_time: '06:30' },
    };

    it('muestra orchard code/name/location/rows', () => {
        const { getByText } = render(<SummaryStep data={data} error={null} />);
        expect(getByText('JP-01')).toBeInTheDocument();
        expect(getByText('JP Farm')).toBeInTheDocument();
        expect(getByText('Cromwell')).toBeInTheDocument();
        expect(getByText('20')).toBeInTheDocument();
    });

    it('location "—" cuando vacío', () => {
        const d = { ...data, orchard: { ...data.orchard, location: '' } };
        const { getByText } = render(<SummaryStep data={d} error={null} />);
        expect(getByText('—')).toBeInTheDocument();
    });

    it('no muestra equipos (se vinculan después en Equipos → Link Staff)', () => {
        const { queryByText } = render(<SummaryStep data={data} error={null} />);
        expect(queryByText(/Teams \(/)).toBeNull();
    });

    it('rates variety + formato $X.XX/bucket + start_time', () => {
        const { getByText } = render(<SummaryStep data={data} error={null} />);
        expect(getByText('Lapin')).toBeInTheDocument();
        expect(getByText('$1.80/bucket')).toBeInTheDocument();
        expect(getByText('06:30')).toBeInTheDocument();
    });

    it('error bloque visible cuando error presente', () => {
        const { getByText } = render(<SummaryStep data={data} error="Failed to create orchard" />);
        expect(getByText(/Failed to create orchard/)).toBeInTheDocument();
    });

    it('error bloque NO visible cuando error null', () => {
        const { container } = render(<SummaryStep data={data} error={null} />);
        expect(container.querySelector('.bg-red-50')).toBeNull();
    });
});
