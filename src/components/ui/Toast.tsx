import React, { useEffect } from 'react';
import { announce } from '@/services/announcer';
import { useTranslation } from '@/i18n';

interface ToastProps {
    message: string;
    /** Texto para lector de pantalla si debe ser más completo que el visible */
    announcement?: string;
    type?: 'success' | 'error' | 'info' | 'warning';
    onClose: () => void;
    className?: string;
}

const Toast: React.FC<ToastProps> = ({ message, announcement, type = 'info', onClose, className = '' }) => {
    const { t } = useTranslation();
    // El toast se monta ya con el texto: se anuncia por las regiones persistentes
    useEffect(() => {
        announce(announcement ?? message, type === 'error' || type === 'warning' ? 'assertive' : 'polite');
    }, [message, announcement, type]);

    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000); // Auto-dismiss after 3s

        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600',
        warning: 'bg-orange-500'
    };

    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info',
        warning: 'warning'
    };

    return (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[300] animate-bounce-in ${className}`}>
            <div className={`${bgColors[type]} text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 min-w-[300px]`}>
                <span aria-hidden="true" className="material-symbols-outlined">{icons[type]}</span>
                <span className="font-bold text-sm tracking-wide flex-1">{message}</span>
                <button aria-label={t('toast.dismiss')} onClick={onClose} className="opacity-80 hover:opacity-100">
                    <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
                </button>
            </div>
        </div>
    );
};

export default Toast;
