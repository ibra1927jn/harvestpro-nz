/**
 * ThemeToggle — Animated dark mode toggle button.
 * Uses sun/moon icons with smooth transition.
 */
import React from 'react';
import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
    className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button
            id="theme-toggle"
            onClick={toggleTheme}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center
                transition-all duration-300 ease-out
                bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600
                text-slate-600 dark:text-yellow-300
                shadow-sm hover:shadow-md active:scale-95
                ${className}`}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
        >
            <span aria-hidden="true"
                className="material-symbols-outlined text-xl transition-transform duration-300"
                style={{ transform: isDark ? 'rotate(360deg)' : 'rotate(0deg)' }}
            >
                {isDark ? 'light_mode' : 'dark_mode'}
            </span>
        </button>
    );
};

export default ThemeToggle;
