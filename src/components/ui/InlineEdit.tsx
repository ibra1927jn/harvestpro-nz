/**
 * InlineEdit.tsx — Click-to-edit text/number field
 *
 * Display-mode: shows value as plain text with a subtle edit icon on hover.
 * Edit-mode: turns into an input that auto-focuses and saves on blur or Enter.
 * Esc cancels. Visual feedback with border glow on focus.
 *
 * Usage:
 *   <InlineEdit
 *     value={employee.phone ?? ''}
 *     onSave={(val) => updateEmployee(employee.id, { phone: val })}
 *     placeholder="Add phone..."
 *     type="text"
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';

export type InlineEditType = 'text' | 'number' | 'date';

interface InlineEditProps {
    value: string;
    onSave: (newValue: string) => void;
    placeholder?: string;
    type?: InlineEditType;
    /** Additional CSS classes for the display text */
    className?: string;
    /** Minimum width of the input */
    minWidth?: string;
    /** Disabled mode */
    disabled?: boolean;
    /** Optional prefix (e.g. "$" for currency) */
    prefix?: string;
    /** Optional suffix (e.g. "/hr" for hourly rate) */
    suffix?: string;
}

const InlineEdit: React.FC<InlineEditProps> = ({
    value,
    onSave,
    placeholder = 'Click to edit...',
    type = 'text',
    className = '',
    minWidth = '80px',
    disabled = false,
    prefix,
    suffix,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync when value prop changes
    useEffect(() => {
        if (!isEditing) setDraft(value);
    }, [value, isEditing]);

    // Auto-focus when entering edit mode
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        setIsEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== value) {
            onSave(trimmed);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setDraft(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    };

    if (disabled) {
        return (
            <span className={`text-sm text-text-secondary ${className}`}>
                {prefix}{value || placeholder}{suffix}
            </span>
        );
    }

    if (isEditing) {
        return (
            <span className="inline-flex items-center gap-0.5">
                {prefix && <span className="text-xs text-text-muted font-medium">{prefix}</span>}
                <input
                    ref={inputRef}
                    type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    aria-label={placeholder}
                    className={`px-1.5 py-0.5 rounded-md border-2 border-indigo-400 bg-indigo-50/50 text-sm font-medium text-text-primary outline-none ring-2 ring-indigo-400/20 transition-all min-w-[${minWidth}]`}
                    step={type === 'number' ? '0.01' : undefined}
                />
                {suffix && <span className="text-xs text-text-muted font-medium">{suffix}</span>}
            </span>
        );
    }

    return (
        <button
            onClick={() => setIsEditing(true)}
            className={`group inline-flex items-center gap-1 px-1 py-0.5 -mx-1 rounded-md hover:bg-indigo-50 transition-colors cursor-text ${className}`}
            title="Click to edit"
        >
            {prefix && <span className="text-xs text-text-muted font-medium">{prefix}</span>}
            <span className={`text-sm font-medium ${value ? 'text-text-primary' : 'text-text-muted'}`}>
                {value || placeholder}
            </span>
            {suffix && <span className="text-xs text-text-muted font-medium">{suffix}</span>}
            <span aria-hidden="true" className="material-symbols-outlined text-xs text-text-disabled opacity-0 group-hover:opacity-100 transition-opacity">
                edit
            </span>
        </button>
    );
};

export default InlineEdit;
