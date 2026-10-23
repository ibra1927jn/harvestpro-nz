import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import DayClosedBanner from './DayClosedBanner';
import { useHarvestStore } from '@/stores/useHarvestStore';

describe('DayClosedBanner', () => {
    beforeEach(() => { act(() => useHarvestStore.setState({ dayClosed: false })); });

    it('shows nothing while the day is open', () => {
        render(<DayClosedBanner />);
        expect(screen.queryByTestId('day-closed-banner')).not.toBeInTheDocument();
    });

    it('tells TL and runner the day is closed (also when it arrives live)', () => {
        render(<DayClosedBanner />);
        act(() => useHarvestStore.setState({ dayClosed: true }));
        expect(screen.getByTestId('day-closed-banner')).toHaveTextContent('The day is closed');
    });
});
