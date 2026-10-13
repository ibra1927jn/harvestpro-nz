/**
 * ModalOverlay.tsx — Unified modal wrapper
 * 
 * Provides consistent backdrop, entrance animation, close behavior,
 * and WCAG 2.1 AA dialog semantics (role, aria-modal, focus trap).
 * Set `static` prop to prevent click-outside closing (for ScannerModal).
 */
import React, { useEffect, useRef } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface ModalOverlayProps {
    children: React.ReactNode;
    onClose: () => void;
    /** If true, disables click-outside and Escape key closing */
    isStatic?: boolean;
    /** Max width class (default: max-w-lg) */
    maxWidth?: string;
    /** Accessible label for the dialog */
    ariaLabel?: string;
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
    children,
    onClose,
    isStatic = false,
    maxWidth = 'max-w-lg',
    ariaLabel = 'Dialog',
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    // Foco dentro, Tab atrapado, Escape cierra y el foco vuelve al botón que lo abrió
    useDialogA11y(dialogRef, { onClose, closeOnEscape: !isStatic });

    // Bloquear scroll del body mientras está abierto
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (!isStatic && e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={handleBackdropClick}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                tabIndex={-1}
                className={`w-full ${maxWidth} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up overflow-hidden outline-none`}
            >
                {children}
            </div>
        </div>
    );
};

export default ModalOverlay;
