/**
 * TrendsTab — días de NZ y textos traducidos
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const getGradeDistribution = vi.fn();
const getInspections = vi.fn();
vi.mock('@/services/qc.service', () => ({
    qcService: {
        getGradeDistribution: (...a: unknown[]) => getGradeDistribution(...a),
        getInspections: (...a: unknown[]) => getInspections(...a),
    },
}));

import TrendsTab from './TrendsTab';

describe('TrendsTab', () => {
    beforeEach(() => {
        getGradeDistribution.mockResolvedValue({ A: 0, B: 0, C: 0, reject: 0, total: 0 });
        getInspections.mockResolvedValue([]);
        // 14 oct 08:30 en NZ (NZDT) = 13 oct 19:30 UTC: el día UTC todavía es "ayer"
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-13T19:30:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('asks for the last 7 NZ days, ending today in NZ (not the UTC date)', async () => {
        render(<TrendsTab orchardId="o1" />);
        await waitFor(() => expect(getGradeDistribution).toHaveBeenCalledTimes(7));
        const days = getGradeDistribution.mock.calls.map(c => c[1]);
        expect(days[6]).toBe('2026-10-14');
        expect(days[0]).toBe('2026-10-08');
        expect(getInspections).toHaveBeenCalledWith('o1', '2026-10-14');
        expect((await screen.findAllByText('Wed 14')).length).toBeGreaterThan(0);
    });
});
