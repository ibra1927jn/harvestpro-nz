/**
 * Tests for modal components: DaySettingsModal
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock hooks used by modals
vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));


// ── DaySettingsModal ────────────────────────────────
import DaySettingsModal from './DaySettingsModal';

describe('DaySettingsModal', () => {
    const defaultProps = {
        onClose: vi.fn(),
        settings: { bucketRate: 3.0, targetTons: 10 },
        onSave: vi.fn(),
    };

    it('renders dialog element', () => {
        render(<DaySettingsModal {...defaultProps} />);
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('calls onClose on Escape', () => {
        const onClose = vi.fn();
        render(<DaySettingsModal {...defaultProps} onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
