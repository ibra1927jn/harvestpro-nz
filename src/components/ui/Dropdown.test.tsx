import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Dropdown from './Dropdown';
import React from 'react';

const options = [
    { value: 'apple', label: 'Apple', icon: 'eco' },
    { value: 'cherry', label: 'Cherry' },
    { value: 'kiwi', label: 'Kiwi' },
    { value: 'disabled-opt', label: 'Disabled', disabled: true },
];

describe('Dropdown', () => {
    const defaultProps = {
        id: 'test-dropdown',
        options,
        value: null as string | null,
        onChange: vi.fn(),
    };

    beforeEach(() => vi.clearAllMocks());

    it('renders with placeholder', () => {
        render(<Dropdown {...defaultProps} />);
        expect(screen.getByText('Select...')).toBeDefined();
    });

    it('renders with custom placeholder', () => {
        render(<Dropdown {...defaultProps} placeholder="Elige fruta" />);
        expect(screen.getByText('Elige fruta')).toBeDefined();
    });

    it('renders label and required indicator', () => {
        render(<Dropdown {...defaultProps} label="Fruta" required />);
        expect(screen.getByText('Fruta')).toBeDefined();
        expect(screen.getByText('*')).toBeDefined();
    });

    it('shows selected value label', () => {
        render(<Dropdown {...defaultProps} value="cherry" />);
        expect(screen.getByText('Cherry')).toBeDefined();
    });

    it('opens dropdown on click and shows options', () => {
        render(<Dropdown {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        expect(screen.getByText('Apple')).toBeDefined();
        expect(screen.getByText('Cherry')).toBeDefined();
        expect(screen.getByText('Kiwi')).toBeDefined();
    });

    it('calls onChange when option selected', () => {
        render(<Dropdown {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByText('Kiwi'));
        expect(defaultProps.onChange).toHaveBeenCalledWith('kiwi');
    });

    it('does not call onChange for disabled options', () => {
        render(<Dropdown {...defaultProps} />);
        fireEvent.click(screen.getByRole('button'));
        fireEvent.click(screen.getByText('Disabled'));
        expect(defaultProps.onChange).not.toHaveBeenCalled();
    });

    it('filters options when searchable', () => {
        render(<Dropdown {...defaultProps} searchable />);
        fireEvent.click(screen.getByRole('button'));
        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'ki' } });
        expect(screen.getByText('Kiwi')).toBeDefined();
        expect(screen.queryByText('Apple')).toBeNull();
    });

    it('shows no results message', () => {
        render(<Dropdown {...defaultProps} searchable />);
        fireEvent.click(screen.getByRole('button'));
        const searchInput = screen.getByPlaceholderText('Search...');
        fireEvent.change(searchInput, { target: { value: 'zzz' } });
        expect(screen.getByText('No results')).toBeDefined();
    });

    it('shows error message', () => {
        render(<Dropdown {...defaultProps} error="Campo obligatorio" />);
        expect(screen.getByText('Campo obligatorio')).toBeDefined();
    });

    it('keyboard: opens with Enter and selects with arrows', () => {
        render(<Dropdown {...defaultProps} />);
        const trigger = screen.getByRole('button');
        fireEvent.keyDown(trigger, { key: 'Enter' });
        // Menu should be open
        expect(screen.getByText('Apple')).toBeDefined();
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(defaultProps.onChange).toHaveBeenCalledWith('apple');
    });

    it('keyboard: closes with Escape', () => {
        render(<Dropdown {...defaultProps} />);
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);
        expect(screen.getByText('Apple')).toBeDefined();
        fireEvent.keyDown(trigger, { key: 'Escape' });
        expect(screen.queryByText('Apple')).toBeNull();
    });
});
