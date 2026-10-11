import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/repositories/pay-rates.repository', () => ({
    loadOrchardNames: vi.fn().mockResolvedValue({ A: 'Orchard A', B: 'Orchard B' }),
}));

import { PayWeekDetail } from './PayWeekDetail';

describe('PayWeekDetail', () => {
    it('muestra cada tramo con su huerto y el día NZ correcto', async () => {
        render(<PayWeekDetail onClose={() => undefined} picker={{
            picker_id: 'p1', picker_name: 'Ana', buckets: 30, hours_worked: 8.5, piece_rate_earnings: 210,
            hourly_rate: 24.7, minimum_required: 203.58, top_up_required: 0, total_earnings: 210, is_below_minimum: false,
            days: [{
                date: '2026-10-12',
                segments: [
                    { orchardId: 'A', checkIn: '2026-10-11T18:00:00Z', checkOut: '2026-10-11T22:00:00Z', open: false, breakStart: null, grossHours: 4 },
                    { orchardId: 'B', checkIn: '2026-10-11T22:30:00Z', checkOut: '2026-10-12T03:30:00Z', open: false, breakStart: null, grossHours: 5 },
                ],
                hours: 8.5, breakMinutes: 30, buckets: 30, bucketsByVariety: { 'Royal Gala': 20, Braeburn: 10 },
                pieceEarnings: 210, topUp: 0, total: 210, belowMinimum: false, estimated: false, isPublicHoliday: false,
            }],
        }} />);
        expect(await screen.findByText('Orchard B')).toBeInTheDocument();
        expect(screen.getByText(/Mon, 12 Oct/)).toBeInTheDocument();
        expect(screen.getByText('11:30')).toBeInTheDocument();
        expect(screen.getByText('20 Royal Gala · 10 Braeburn')).toBeInTheDocument();
    });
});
