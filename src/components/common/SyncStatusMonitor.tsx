import { logger } from '@/utils/logger';
import React, { useState, useEffect, useCallback } from 'react';
import { useHarvestStore } from '../../stores/useHarvestStore';
import { offlineService } from '../../services/offline.service';
import { syncService } from '../../services/sync.service';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { announce } from '../../services/announcer';

const SyncStatusMonitor: React.FC = () => {
    const buckets = useHarvestStore((state) => state.buckets);
    // Los rechazados no están "pendientes": antes dejaban el aviso de sincronizando para siempre
    const storePending = buckets.filter(b => !b.synced && !b.failed).length;
    const [vaultPending, setVaultPending] = useState<number>(0);
    const [lastSyncAgo, setLastSyncAgo] = useState<string | null>(null);
    const [maxRetries, setMaxRetries] = useState(0);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    // Cambios que no se pudieron enviar (dead letter queue de este móvil).
    // Antes no se enseñaban en ninguna pantalla (la vista DLQ no está montada).
    const [deadLetters, setDeadLetters] = useState<Awaited<ReturnType<typeof syncService.getDeadLetters>>>([]);
    const [showDeadLetters, setShowDeadLetters] = useState(false);

    const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();

    // Handle reconnection from offline → online (with jitter to prevent thundering herd)
    useEffect(() => {
        if (wasOffline && isOnline) {
            // Stagger sync by 0-30s to prevent hundreds of devices
            // from DDoS-ing Supabase when Wi-Fi returns at end of shift
            const delay = Math.floor(Math.random() * 30_000);
            const timer = setTimeout(() => syncService.processQueue(), delay);
            clearWasOffline();
            return () => clearTimeout(timer);
        }
    }, [wasOffline, isOnline, clearWasOffline]);

    // Poll Dexie for "True" pending count + sync metadata
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const count = await offlineService.getPendingCount();
                setVaultPending(count);

                // Update retry count from sync queue (now async — Dexie)
                setMaxRetries(await syncService.getMaxRetryCount());
                const dead = await syncService.getDeadLetters();
                setDeadLetters(prev =>
                    prev.length === dead.length && prev.every((d, i) => d.id === dead[i].id) ? prev : dead
                );

                // Update "last synced" relative time (now async — Dexie)
                const lastSync = await syncService.getLastSyncTime();
                if (lastSync) {
                    const diffMs = Date.now() - lastSync;
                    const diffSec = Math.floor(diffMs / 1000);
                    if (diffSec < 60) {
                        setLastSyncAgo('just now');
                    } else if (diffSec < 3600) {
                        setLastSyncAgo(`${Math.floor(diffSec / 60)}m ago`);
                    } else {
                        setLastSyncAgo(`${Math.floor(diffSec / 3600)}h ago`);
                    }
                }
            } catch (error) {
                logger.error('Failed to check sync status:', error);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    // Show success toast when items finish syncing
    const displayCount = Math.max(storePending, vaultPending);
    const prevCountRef = React.useRef(displayCount);

    useEffect(() => {
        if (prevCountRef.current > 0 && displayCount === 0 && isOnline) {
            setShowSuccess(true);
            const timer = setTimeout(() => setShowSuccess(false), 3000);
            return () => clearTimeout(timer);
        }
        prevCountRef.current = displayCount;
    }, [displayCount, isOnline]);

    // Manual sync trigger
    const handleManualSync = useCallback(async () => {
        if (!isOnline || isSyncing) return;
        setIsSyncing(true);
        try {
            await syncService.processQueue();
        } finally {
            setIsSyncing(false);
        }
    }, [isOnline, isSyncing]);

    // Calcular si ultima sync fue hace mas de 30 minutos
    const [lastSyncMs, setLastSyncMs] = useState<number | null>(null);
    useEffect(() => {
        const checkSyncAge = async () => {
            try {
                const lastSync = await syncService.getLastSyncTime();
                setLastSyncMs(lastSync);
            } catch {
                // Silenciar error — no critico
            }
        };
        checkSyncAge();
        const interval = setInterval(checkSyncAge, 15_000);
        return () => clearInterval(interval);
    }, []);

    const isStaleSync = lastSyncMs !== null && (Date.now() - lastSyncMs) > 30 * 60 * 1000;
    const hasSyncError = maxRetries >= 10;

    // Lector de pantalla: avisar de los cambios de estado por las regiones persistentes
    const prevOnline = React.useRef(isOnline);
    useEffect(() => {
        if (prevOnline.current === isOnline) return;
        prevOnline.current = isOnline;
        announce(
            isOnline
                ? 'Back online. Saved scans will sync now.'
                : 'No signal. Scans are saved on this phone and will sync when you are back online.',
            isOnline ? 'polite' : 'assertive'
        );
    }, [isOnline]);
    const syncErrorShown = hasSyncError && displayCount > 0;
    useEffect(() => {
        if (syncErrorShown) announce(`Sync error. ${displayCount} items could not be sent.`, 'assertive');
        // Solo al entrar en error, no en cada cambio del contador
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncErrorShown]);
    useEffect(() => {
        if (showSuccess) announce('All scans synced.');
    }, [showSuccess]);

    // 1. Offline Warning (High Priority)
    if (!isOnline) {
        return (
            <div
                className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center justify-between shrink-0 z-50 animate-in slide-in-from-top"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-600 text-lg" aria-hidden="true">wifi_off</span>
                    <p className="text-red-800 text-xs font-bold uppercase tracking-wide">You are Offline</p>
                </div>
                <div className="flex items-center gap-2">
                    {displayCount > 0 && (
                        <span className="text-[10px] font-bold bg-white/50 px-2 py-0.5 rounded text-red-700">
                            {displayCount} queued
                        </span>
                    )}
                    {lastSyncAgo && (
                        <span className="text-[10px] text-red-500">
                            Last sync: {lastSyncAgo}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // 2. Sync error: demasiados reintentos — boton de retry visible
    if (hasSyncError && displayCount > 0) {
        return (
            <div
                className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between shrink-0 z-50 animate-in slide-in-from-top"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-600 text-lg" aria-hidden="true">sync_problem</span>
                    <div>
                        <p className="text-red-800 text-xs font-bold uppercase tracking-wide">Sync Error</p>
                        <p className="text-[10px] text-red-600">{displayCount} items failed ({maxRetries} retries)</p>
                    </div>
                </div>
                <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="text-[10px] font-bold bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                    aria-label="Retry sync"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-xs">refresh</span>
                    {isSyncing ? 'Retrying...' : 'Retry Now'}
                </button>
            </div>
        );
    }

    // 2b. Cambios que no se enviaron (no se reintentan solos): visibles, con motivo
    if (deadLetters.length > 0) {
        return (
            <div
                className="bg-red-50 border-b border-red-200 px-4 py-2 shrink-0 z-50"
                role="alert"
                data-testid="dead-letter-banner"
            >
                <button
                    type="button"
                    onClick={() => setShowDeadLetters(v => !v)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                >
                    <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-600 text-lg" aria-hidden="true">sync_problem</span>
                        <span className="text-red-800 text-xs font-bold">
                            {deadLetters.length} change{deadLetters.length === 1 ? '' : 's'} could not be sent — kept on this device. Tell your manager.
                        </span>
                    </span>
                    <span className="material-symbols-outlined text-red-600 text-base" aria-hidden="true">
                        {showDeadLetters ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
                {showDeadLetters && (
                    <ul className="mt-1 pl-7 text-[11px] text-red-700 list-disc space-y-0.5">
                        {deadLetters.map(d => (
                            <li key={d.id}>
                                {d.type} — {d.failureReason} ({new Date(d.movedAt).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })})
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    // 3. Success Toast (auto-dismiss)
    if (showSuccess) {
        return (
            <div
                className="bg-green-50 border-b border-green-100 px-4 py-2 flex items-center justify-between shrink-0 z-50 animate-in slide-in-from-top"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-600 text-lg" aria-hidden="true">check_circle</span>
                    <p className="text-green-800 text-xs font-bold uppercase tracking-wide">All Synced</p>
                </div>
                {lastSyncAgo && (
                    <span className="text-[10px] text-green-600">
                        {lastSyncAgo}
                    </span>
                )}
            </div>
        );
    }

    // 4. Stale sync warning: ultima sync > 30 min
    if (isStaleSync && displayCount === 0) {
        return (
            <div
                className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between shrink-0 z-50 animate-in slide-in-from-top"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-lg" aria-hidden="true">schedule</span>
                    <div>
                        <p className="text-amber-800 text-xs font-bold uppercase tracking-wide">Sync Stale</p>
                        <p className="text-[10px] text-amber-600">Last synced {lastSyncAgo}</p>
                    </div>
                </div>
                <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="text-[10px] font-bold bg-amber-200 hover:bg-amber-300 px-3 py-1 rounded text-amber-800 transition-colors disabled:opacity-50 flex items-center gap-1"
                    aria-label="Sync now"
                >
                    <span aria-hidden="true" className="material-symbols-outlined text-xs">sync</span>
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
            </div>
        );
    }

    // 5. Syncing State / Pending Queue
    if (displayCount > 0) {
        return (
            <div
                className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex items-center justify-between shrink-0 z-50 animate-in slide-in-from-top"
            >
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-orange-600 text-lg" aria-hidden="true">cloud_sync</span>
                    <p className="text-orange-800 text-xs font-bold uppercase tracking-wide">
                        Syncing {displayCount} items...
                        {maxRetries > 0 && (
                            <span className="text-[10px] opacity-75 ml-1">(retry {maxRetries}/50)</span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="text-[10px] font-bold bg-orange-200 hover:bg-orange-300 px-2 py-0.5 rounded text-orange-800 transition-colors disabled:opacity-50"
                        aria-label={isSyncing ? 'Syncing in progress' : 'Sync now'}
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <div className="size-4 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin" aria-hidden="true" />
                </div>
            </div>
        );
    }

    return null;
};

export default SyncStatusMonitor;