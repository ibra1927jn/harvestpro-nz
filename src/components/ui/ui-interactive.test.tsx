/**
 * Tests for UI interactive components: InlineSelect, ComponentErrorBoundary
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineSelect from './InlineSelect';

vi.mock('@/utils/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('InlineSelect', () => {
    const defaultProps = {
        value: 'active',
        options: ['active', 'on_leave', 'terminated'],
        onSave: vi.fn(),
    };

    it('renders display pill with formatted value', () => {
        render(<InlineSelect {...defaultProps} />);
        expect(screen.getByText('Active')).toBeTruthy();
    });

    it('uses labelMap for display', () => {
        render(<InlineSelect {...defaultProps} labelMap={{ active: 'Active' }} />);
        expect(screen.getByText('Active')).toBeTruthy();
    });

    it('renders as disabled pill when disabled', () => {
        const { container } = render(<InlineSelect {...defaultProps} disabled={true} />);
        expect(container.querySelector('span')).toBeTruthy();
        expect(container.querySelector('button')).toBeNull();
        expect(container.querySelector('select')).toBeNull();
    });

    it('enters edit mode on click', () => {
        render(<InlineSelect {...defaultProps} />);
        fireEvent.click(screen.getByText('Active'));
        const select = screen.getByRole('combobox');
        expect(select).toBeTruthy();
    });

    it('shows all options in edit mode', () => {
        render(<InlineSelect {...defaultProps} />);
        fireEvent.click(screen.getByText('Active'));
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(3);
    });

    it('calls onSave when selection changes', () => {
        const onSave = vi.fn();
        render(<InlineSelect {...defaultProps} onSave={onSave} />);
        fireEvent.click(screen.getByText('Active'));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'on_leave' } });
        expect(onSave).toHaveBeenCalledWith('on_leave');
    });

    it('does not call onSave when same value selected', () => {
        const onSave = vi.fn();
        render(<InlineSelect {...defaultProps} onSave={onSave} />);
        fireEvent.click(screen.getByText('Active'));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'active' } });
        expect(onSave).not.toHaveBeenCalled();
    });

    it('exits edit mode on blur', () => {
        render(<InlineSelect {...defaultProps} />);
        fireEvent.click(screen.getByText('Active'));
        fireEvent.blur(screen.getByRole('combobox'));
        expect(screen.queryByRole('combobox')).toBeNull();
    });
});

// ── ComponentErrorBoundary ──────────────────────────
import ComponentErrorBoundary from './ComponentErrorBoundary';

const ThrowingWidget = () => {
    throw new Error('Widget crashed');
};

describe('ComponentErrorBoundary', () => {
    const origError = console.error;
    beforeAll(() => { console.error = vi.fn(); });
    afterAll(() => { console.error = origError; });

    it('renders children when no error', () => {
        render(<ComponentErrorBoundary><p>Content</p></ComponentErrorBoundary>);
        expect(screen.getByText('Content')).toBeTruthy();
    });

    it('renders fallback when child throws', () => {
        render(<ComponentErrorBoundary componentName="Analytics"><ThrowingWidget /></ComponentErrorBoundary>);
        expect(screen.getByText('Analytics failed to load')).toBeTruthy();
    });

    it('shows retry button in fallback', () => {
        render(<ComponentErrorBoundary><ThrowingWidget /></ComponentErrorBoundary>);
        expect(screen.getByText('Retry')).toBeTruthy();
    });

    it('shows generic name when componentName not provided', () => {
        render(<ComponentErrorBoundary><ThrowingWidget /></ComponentErrorBoundary>);
        expect(screen.getByText('This section failed to load')).toBeTruthy();
    });
});
