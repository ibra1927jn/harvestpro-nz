/**
 * "Ahora en Huerto B": la persona está fichada en otro huerto de la empresa.
 */
import React from 'react';
import type { Picker } from '@/types';

export const ElsewhereBadge: React.FC<{ person: Pick<Picker, 'elsewhere'> }> = ({ person }) => {
    if (!person.elsewhere) return null;
    return (
        <span
            data-testid="elsewhere-badge"
            title={`Working now at ${person.elsewhere.orchard_name}`}
            className="inline-flex items-center gap-0.5 text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-bold max-w-full"
        >
            <span className="material-symbols-outlined text-[11px]">swap_horiz</span>
            <span className="truncate">Now at {person.elsewhere.orchard_name}</span>
        </span>
    );
};

export default ElsewhereBadge;
