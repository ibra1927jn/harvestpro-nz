/**
 * Icon — Lightweight wrapper for Material Symbols
 * Drop-in replacement for lucide-react icon components.
 * Usage: <Icon name="shield" size={20} className="text-blue-600" />
 */
import React from 'react';

interface IconProps {
    /** Material Symbols icon name (snake_case) */
    name: string;
    /** Size in pixels — maps to font-size */
    size?: number;
    /** Extra CSS classes */
    className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size, className = '' }) => (
    <span aria-hidden="true"
        className={`material-symbols-outlined ${className}`}
        style={size ? { fontSize: `${size}px` } : undefined}
    >
        {name}
    </span>
);

export default Icon;
