import { logger } from '@/utils/logger';
import { captureSentryError } from '@/config/sentry';
import { translate as t } from '@/i18n';
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error("Uncaught error:", error, errorInfo);
        // Report to Sentry — this is how crashes in the field reach the dev team
        captureSentryError(error, {
            componentStack: errorInfo.componentStack || 'unknown',
        });
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleClearCache = () => {
        // SAFE CLEAR: Preserve unsynced bucket data before nuking storage
        try {
            const storeData = localStorage.getItem('harvest-pro-storage');
            const authKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-'));
            const authBackup: Record<string, string> = {};
            authKeys.forEach(k => { authBackup[k] = localStorage.getItem(k) || ''; });

            localStorage.clear();
            sessionStorage.clear();

            // Restore critical data
            if (storeData) localStorage.setItem('harvest-pro-storage', storeData);
            Object.entries(authBackup).forEach(([k, v]) => localStorage.setItem(k, v));
        } catch (e) {
            logger.warn('[ErrorBoundary] Backup failed, performing full clear:', e);
            // Last resort: full clear if backup fails
            localStorage.clear();
            sessionStorage.clear();
        }

        // Clear service worker caches (these are safe to nuke)
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach((name) => {
                    caches.delete(name);
                });
            });
        }

        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-background-light p-4 text-center">
                    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-border-light">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-red-600">error</span>
                        </div>

                        <h1 className="text-2xl font-black text-text-primary mb-2">{t('error.title')}</h1>
                        <p className="text-text-secondary mb-6">
                            {t('error.description')}
                        </p>

                        <div className="bg-surface-secondary rounded-lg p-3 mb-6 text-left overflow-auto max-h-32">
                            <code className="text-xs text-red-500 font-mono break-all">
                                {this.state.error?.toString()}
                            </code>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={this.handleReload}
                                className="w-full py-3 bg-text-primary text-white rounded-xl font-bold hover:bg-black transition-colors"
                            >
                                {t('error.reload')}
                            </button>

                            <button
                                onClick={this.handleClearCache}
                                className="w-full py-3 bg-white border border-border-light text-text-secondary rounded-xl font-bold hover:bg-background-light transition-colors flex items-center justify-center gap-2"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">delete_history</span>
                                {t('error.clearCache')}
                            </button>

                            {/* Reportar problema */}
                            <a
                                href={`mailto:support@harvestpro.nz?subject=App Crash Report&body=${encodeURIComponent(
                                    `Error: ${this.state.error?.message || 'Unknown'}\nStack: ${this.state.error?.stack?.substring(0, 500) || 'N/A'}\nTime: ${new Date().toISOString()}\nURL: ${typeof window !== 'undefined' ? window.location.href : ''}`
                                )}`}
                                className="w-full py-3 bg-white border border-border-light text-text-secondary rounded-xl font-bold hover:bg-background-light transition-colors flex items-center justify-center gap-2"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">bug_report</span>
                                Report Issue
                            </a>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;