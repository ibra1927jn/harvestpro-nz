/**
 * Piezas de marcado de «Mi cuenta»: sección con cabecera, campo de texto y
 * línea de estado (éxito / error) con región viva para lectores de pantalla.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import type { AccountErrorCode } from '@/services/account.service';

// Sin cn()/tailwind-merge (28 KB que la app no carga en ningún otro sitio)
const join = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

interface SectionProps {
    icon: string;
    title: string;
    children: React.ReactNode;
}

export const AccountSection: React.FC<SectionProps> = ({ icon, title, children }) => (
    <section aria-label={title} className="bg-surface-white rounded-2xl border border-border-light shadow-sm p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-sub">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
            {title}
        </h3>
        {children}
    </section>
);

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
    id: string;
    label: string;
    hint?: string;
}

export const AccountField: React.FC<FieldProps> = ({ id, label, hint, className, ...rest }) => (
    <div>
        <label htmlFor={id} className="block text-xs font-bold text-text-sub uppercase tracking-wider mb-1.5">
            {label}
        </label>
        <input
            id={id}
            aria-describedby={hint ? `${id}-hint` : undefined}
            className={join(
                'w-full bg-background-light border border-border-light text-text-main py-3 px-4 rounded-xl text-sm',
                'focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-60',
                className,
            )}
            {...rest}
        />
        {hint && <p id={`${id}-hint`} className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
);

export type AccountStatus = { kind: 'ok'; text: string } | { kind: 'error'; code: AccountErrorCode } | null;

/** Mensaje bajo un formulario: éxito en verde, error traducido en rojo */
export const AccountStatusLine: React.FC<{ status: AccountStatus }> = ({ status }) => {
    const { t } = useTranslation();
    if (!status) return null;
    if (status.kind === 'ok') {
        return (
            <p role="status" className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
                {status.text}
            </p>
        );
    }
    return (
        <p role="alert" className="text-xs font-semibold text-red-600 flex items-center gap-1">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">error</span>
            {t(`account.error.${status.code.toLowerCase()}`)}
        </p>
    );
};

interface PanelProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * Panel lateral de Mi cuenta (mismo patrón que PickerDrawer): fondo que cierra,
 * role="dialog", foco atrapado y Escape (useDialogA11y), portal al body para
 * quedar por encima de la barra inferior. No usa ui/Drawer para no arrastrar
 * tailwind-merge al precache.
 */
export const AccountPanel: React.FC<PanelProps> = ({ title, onClose, children }) => {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);
    useDialogA11y(panelRef, { onClose });
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);
    return createPortal(
        <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative w-full max-w-md h-full bg-background-light shadow-2xl outline-none animate-slide-in-right overflow-y-auto"
            >
                <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-surface-white border-b border-border-light">
                    <span aria-hidden="true" className="material-symbols-outlined text-primary text-xl">person</span>
                    <h2 className="text-lg font-bold text-text-main flex-1">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-slate-100 transition-colors"
                        aria-label={t('ui.close_panel')}
                    >
                        <span aria-hidden="true" className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body,
    );
};

export const AccountPrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }> = ({
    busy, children, className, disabled, ...rest
}) => (
    <button
        type="submit"
        disabled={disabled || busy}
        className={join(
            'min-h-[44px] px-4 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20',
            'hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
            className,
        )}
        {...rest}
    >
        {busy && <span aria-hidden="true" className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
        {children}
    </button>
);
