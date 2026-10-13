/**
 * CardSkeleton — placeholder accesible para tarjetas en estado de carga.
 *
 * Uso:
 *   <CardSkeleton lines={3} />  — 3 líneas shimmer
 *   <CardSkeleton className="h-40" />  — altura personalizada
 */
import React from 'react';
import { translate } from '@/i18n';

interface CardSkeletonProps {
    /** Número de líneas de contenido simuladas (default: 2) */
    lines?: number;
    /** Clases extra para el contenedor */
    className?: string;
}

const CardSkeleton: React.FC<CardSkeletonProps> = ({ lines = 2, className = '' }) => (
    <div
        role="status"
        aria-busy={true}
        aria-label={translate('ui.loading')}
        className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3 ${className}`}
    >
        {/* Barra de título simulada */}
        <div className="h-4 bg-slate-200 rounded-full animate-pulse w-2/5" />

        {/* Líneas de contenido */}
        {Array.from({ length: lines }).map((_, i) => (
            <div
                key={i}
                className={`h-3 bg-slate-100 rounded-full animate-pulse ${i === lines - 1 ? 'w-3/5' : 'w-full'}`}
            />
        ))}
    </div>
);

export default CardSkeleton;
