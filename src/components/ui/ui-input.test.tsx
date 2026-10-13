/**
 * Tests for UI input components: InlineEdit, InlineSelect
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── InlineEdit ──────────────────────────────────────
import InlineEdit from './InlineEdit';

describe('InlineEdit', () => {
    it('renders value in display mode', () => {
        render(<InlineEdit value="John" onSave={vi.fn()} />);
        expect(screen.getByText('John')).toBeTruthy();
    });

    it('shows placeholder when value is empty', () => {
        render(<InlineEdit value="" onSave={vi.fn()} placeholder="Add name..." />);
        expect(screen.getByText('Add name...')).toBeTruthy();
    });

    it('shows edit icon on hover (hidden by default via CSS)', () => {
        render(<InlineEdit value="Test" onSave={vi.fn()} />);
        expect(screen.getByText('edit')).toBeTruthy();
    });

    it('enters edit mode on click', () => {
        render(<InlineEdit value="Hello" onSave={vi.fn()} placeholder="Edit me" />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        expect(screen.getByRole('textbox')).toBeTruthy();
    });

    it('populates input with current value', () => {
        render(<InlineEdit value="Hello" onSave={vi.fn()} />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.value).toBe('Hello');
    });

    it('calls onSave with new value on blur', () => {
        const onSave = vi.fn();
        render(<InlineEdit value="Old" onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'New' } });
        fireEvent.blur(input);
        expect(onSave).toHaveBeenCalledWith('New');
    });

    it('calls onSave on Enter key', () => {
        const onSave = vi.fn();
        render(<InlineEdit value="Old" onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Updated' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSave).toHaveBeenCalledWith('Updated');
    });

    it('cancels edit on Escape key (reverts to original)', () => {
        const onSave = vi.fn();
        render(<InlineEdit value="Original" onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'Changed' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        // After Escape, should be back in display mode showing original value
        expect(screen.getByText('Original')).toBeTruthy();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('does not call onSave when value unchanged', () => {
        const onSave = vi.fn();
        render(<InlineEdit value="Same" onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        fireEvent.blur(screen.getByRole('textbox'));
        expect(onSave).not.toHaveBeenCalled();
    });

    it('renders as plain text when disabled', () => {
        render(<InlineEdit value="Locked" onSave={vi.fn()} disabled />);
        expect(screen.getByText('Locked')).toBeTruthy();
        expect(screen.queryByTitle('Click to edit')).toBeNull();
    });

    it('renders prefix and suffix', () => {
        render(<InlineEdit value="50" onSave={vi.fn()} prefix="$" suffix="/hr" />);
        expect(screen.getByText('$')).toBeTruthy();
        expect(screen.getByText('/hr')).toBeTruthy();
    });

    it('uses number input type when type=number', () => {
        render(<InlineEdit value="10" onSave={vi.fn()} type="number" />);
        fireEvent.click(screen.getByTitle('Click to edit'));
        const input = screen.getByRole('spinbutton') as HTMLInputElement;
        expect(input.type).toBe('number');
    });
});

// ── InlineSelect ────────────────────────────────────
import InlineSelect from './InlineSelect';

describe('InlineSelect', () => {
    const options = ['active', 'on_leave', 'terminated'];

    it('renders current value as pill', () => {
        render(<InlineSelect value="active" options={options} onSave={vi.fn()} />);
        expect(screen.getByText('Active')).toBeTruthy();
    });

    it('applies labelMap for display', () => {
        render(
            <InlineSelect
                value="on_leave"
                options={options}
                onSave={vi.fn()}
                labelMap={{ on_leave: 'On Leave' }}
            />,
        );
        expect(screen.getByText('On Leave')).toBeTruthy();
    });

    it('enters edit mode on click', () => {
        render(<InlineSelect value="active" options={options} onSave={vi.fn()} />);
        fireEvent.click(screen.getByTitle('Click to change'));
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select).toBeTruthy();
        expect(select.value).toBe('active');
    });

    it('renders all options in select', () => {
        render(<InlineSelect value="active" options={options} onSave={vi.fn()} />);
        fireEvent.click(screen.getByTitle('Click to change'));
        const opts = screen.getAllByRole('option');
        expect(opts).toHaveLength(3);
    });

    it('calls onSave when selection changes', () => {
        const onSave = vi.fn();
        render(<InlineSelect value="active" options={options} onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to change'));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'terminated' } });
        expect(onSave).toHaveBeenCalledWith('terminated');
    });

    it('does NOT call onSave when same value selected', () => {
        const onSave = vi.fn();
        render(<InlineSelect value="active" options={options} onSave={onSave} />);
        fireEvent.click(screen.getByTitle('Click to change'));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'active' } });
        expect(onSave).not.toHaveBeenCalled();
    });

    it('exits edit mode on blur', () => {
        render(<InlineSelect value="active" options={options} onSave={vi.fn()} />);
        fireEvent.click(screen.getByTitle('Click to change'));
        fireEvent.blur(screen.getByRole('combobox'));
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('renders as static pill when disabled', () => {
        render(<InlineSelect value="active" options={options} onSave={vi.fn()} disabled />);
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.queryByTitle('Click to change')).toBeNull();
    });

    it('applies colorMap to pill', () => {
        const { container } = render(
            <InlineSelect
                value="active"
                options={options}
                onSave={vi.fn()}
                colorMap={{ active: 'bg-emerald-100 text-emerald-700' }}
            />,
        );
        const pill = container.querySelector('.bg-emerald-100');
        expect(pill).toBeTruthy();
    });
});
