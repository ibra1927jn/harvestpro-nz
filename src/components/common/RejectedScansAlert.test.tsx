import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const listRecent = vi.fn();
vi.mock('@/repositories/rejected-scans.repository', () => ({
    rejectedScansRepository: { listRecent: (...a: unknown[]) => listRecent(...a) },
}));

import { RejectedScansAlert } from './RejectedScansAlert';

describe('RejectedScansAlert', () => {
    it('shows nothing when no scan was rejected or flagged', async () => {
        listRecent.mockResolvedValueOnce([]);
        const { container } = render(<RejectedScansAlert orchardId="o1" />);
        await new Promise(r => setTimeout(r, 0));
        expect(container).toBeEmptyDOMElement();
    });

    it('counts rejected and flagged scans and lists who, when, by whom and why', async () => {
        listRecent.mockResolvedValueOnce([
            { id: 'a', kind: 'rejected', reason: 'PAY_WEEK_CLOSED: the pay week of this bucket is closed.', pickerCode: 'LOC-018', pickerName: 'Ana', reportedBy: 'Rui Runner', scannedAt: '2026-10-12T21:05:00Z', createdAt: '2026-10-13T01:00:00Z' },
            { id: 'b', kind: 'rejected', reason: 'UNKNOWN_BADGE: "LOC-999"', pickerCode: 'LOC-999', pickerName: null, reportedBy: 'Rui Runner', scannedAt: null, createdAt: '2026-10-13T01:00:00Z' },
            { id: 'c', kind: 'flagged', reason: 'PHONE_CLOCK_OFF: phone clock 90 min behind', pickerCode: 'LOC-001', pickerName: 'Bo', reportedBy: null, scannedAt: '2026-10-12T22:00:00Z', createdAt: '2026-10-13T01:00:00Z' },
        ]);
        render(<RejectedScansAlert orchardId="o1" />);
        expect(await screen.findByText(/2 bucket scans rejected \(not counted for pay\) · 1 saved with a doubtful time — last 7 days/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByText(/Rejected: Ana — scanned 13 Oct, 10:05 by Rui Runner — PAY_WEEK_CLOSED/)).toBeInTheDocument();
        expect(screen.getByText(/Rejected: LOC-999 — scanned — by Rui Runner — UNKNOWN_BADGE/)).toBeInTheDocument();
        expect(screen.getByText(/Check time: Bo — scanned 13 Oct, 11:00 — PHONE_CLOCK_OFF/)).toBeInTheDocument();
        expect(listRecent).toHaveBeenLastCalledWith('o1', 7);
    });
});
