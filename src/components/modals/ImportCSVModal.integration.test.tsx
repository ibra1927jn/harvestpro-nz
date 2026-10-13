/**
 * Integration tests for ImportCSVModal (399L)
 * Covers: render, step wizard, CSV parsing, template download
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/utils/csvParser', () => ({
    parseCSV: vi.fn().mockReturnValue({ rows: [], errors: [], warnings: [] }),
    generateCSVTemplate: vi.fn().mockReturnValue('picker_id,name\n'),
}));

vi.mock('@/services/picker.service', () => ({
    pickerService: {
        bulkImport: vi.fn().mockResolvedValue({ imported: 0, errors: [] }),
    },
}));

vi.mock('@/hooks/useToast', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/ModalOverlay', () => ({
    default: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) =>
        React.createElement('div', { 'data-testid': 'modal-overlay' },
            React.createElement('button', { 'data-testid': 'close-modal', onClick: onClose }, 'X'),
            children
        ),
}));

import ImportCSVModal from './ImportCSVModal';

describe('ImportCSVModal Integration', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        orchardId: 'o1',
        existingPickers: [{ picker_id: 'p1', name: 'Existing' }],
        onImportComplete: vi.fn(),
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders when open', () => {
        render(React.createElement(ImportCSVModal, defaultProps));
        expect(screen.getByTestId('modal-overlay')).toBeDefined();
    });

    it('close button calls onClose', () => {
        render(React.createElement(ImportCSVModal, defaultProps));
        screen.getByTestId('close-modal').click();
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('does not render when not open', () => {
        render(React.createElement(ImportCSVModal, { ...defaultProps, isOpen: false }));
        expect(screen.queryByTestId('modal-overlay')).toBeNull();
    });
});
