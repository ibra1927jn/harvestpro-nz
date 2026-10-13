/**
 * InlineSelect.tsx — Click-to-edit dropdown select field
 *
 * Display-mode: shows the current value as a styled pill.
 * Edit-mode: turns into a native select dropdown.
 * Auto-saves on selection change.
 *
 * Usage:
 *   <InlineSelect
 *     value={employee.status}
 *     options={['active', 'on_leave', 'terminated']}
 *     onSave={(val) => updateEmployee(employee.id, { status: val })}
 *     colorMap={{ active: 'bg-emerald-100 text-emerald-700', ... }}
 *   />
 */
import React, { useState, useRef, useEffect } from 'react';

interface InlineSelectProps {
    value: string;
    options: string[];
    onSave: (newValue: string) => void;
    /** Optional label map for display: { 'work_visa': 'Work Visa' } */
    labelMap?: Record<string, string>;
    /** Optional color map for pill styling */
    colorMap?: Record<string, string>;
    /** Disabled mode */
    disabled?: boolean;
}

const InlineSelect: React.FC<InlineSelectProps> = ({
    value,
    options,
    onSave,
    labelMap,
    colorMap,
    disabled = false,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        if (isEditing && selectRef.current) {
            selectRef.current.focus();
        }
    }, [isEditing]);

    const displayLabel = labelMap?.[value] || value.replace(/_/g, ' ');
    const pillColor = colorMap?.[value] || 'bg-surface-secondary text-text-primary';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value;
        setIsEditing(false);
        if (newVal !== value) {
            onSave(newVal);
        }
    };

    if (disabled) {
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${pillColor}`}>
                {displayLabel}
            </span>
        );
    }

    if (isEditing) {
        return (
            <select
                ref={selectRef}
                value={value}
                onChange={handleChange}
                onBlur={() => setIsEditing(false)}
                aria-label={`Select ${displayLabel}`}
                className="px-2 py-1 rounded-lg border-2 border-indigo-400 bg-indigo-50/50 text-xs font-bold text-text-primary outline-none ring-2 ring-indigo-400/20 transition-all"
            >
                {options.map(opt => (
                    <option key={opt} value={opt}>
                        {labelMap?.[opt] || opt.replace(/_/g, ' ')}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <button
            onClick={() => setIsEditing(true)}
            className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-all hover:ring-2 hover:ring-indigo-300/50 cursor-pointer ${pillColor}`}
            title="Click to change"
        >
            {displayLabel}
            <span aria-hidden="true" className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-70 transition-opacity">
                expand_more
            </span>
        </button>
    );
};

export default InlineSelect;
