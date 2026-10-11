/**
 * SyncStatusBadge.tsx — Real-time sync / offline status indicator
 *
 * PERF-3 FIX: Shows workers current connection state with the server.
 * Displayed in the app header — workers see immediately if they're offline.
 *
 * States:
 *   🟢 Online  — Supabase reachable, all synced
 *   🟡 Syncing — Flushing pending queue to server
 *   🔴 Offline — No network, queuing locally
 *   ⚠️ Error   — Sync failed, items in Dead Letter Queue
 */

import { useState, useEffect } from 'react';

type SyncState = 'online' | 'offline' | 'syncing' | 'error';

interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  dlqCount: number;
  lastSyncAt: string | null;
}

function getSyncStatus(): SyncStatus {
  const isOnline = navigator.onLine;
  const pendingRaw = localStorage.getItem('sync_queue_count');
  const dlqRaw = localStorage.getItem('dlq_count');
  const lastSync = localStorage.getItem('last_sync_at');
  const pendingCount = parseInt(pendingRaw || '0', 10) || 0;
  const dlqCount = parseInt(dlqRaw || '0', 10) || 0;

  if (dlqCount > 0) return { state: 'error', pendingCount, dlqCount, lastSyncAt: lastSync };
  if (!isOnline) return { state: 'offline', pendingCount, dlqCount, lastSyncAt: lastSync };
  if (pendingCount > 0) return { state: 'syncing', pendingCount, dlqCount, lastSyncAt: lastSync };
  return { state: 'online', pendingCount, dlqCount, lastSyncAt: lastSync };
}

const STATE_CONFIG: Record<SyncState, { icon: string; label: string; color: string; pulse: boolean }> = {
  online:  { icon: '●', label: 'Synced',   color: '#22c55e', pulse: false },
  syncing: { icon: '◌', label: 'Syncing…', color: '#f59e0b', pulse: true  },
  offline: { icon: '●', label: 'Offline',  color: '#ef4444', pulse: false },
  error:   { icon: '⚠', label: 'Sync Error',color: '#f97316',pulse: true  },
};

export function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => {
    // Poll every 5 seconds
    const interval = setInterval(() => setStatus(getSyncStatus()), 5000);

    const handleOnline  = () => setStatus(getSyncStatus());
    const handleOffline = () => setStatus(getSyncStatus());
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const cfg = STATE_CONFIG[status.state];

  return (
    <div
      className="sync-status-badge"
      title={
        status.state === 'offline'
          ? `Offline — ${status.pendingCount} items queued locally`
          : status.state === 'error'
          ? `Sync error — ${status.dlqCount} items in dead letter queue`
          : status.state === 'syncing'
          ? `Syncing ${status.pendingCount} items…`
          : status.lastSyncAt
          ? `Last synced ${new Date(status.lastSyncAt).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland' })}`
          : 'All synced'
      }
      role="status"
      aria-live="polite"
    >
      <span
        className={`sync-dot${cfg.pulse ? ' sync-dot--pulse' : ''}`}
        style={{ color: cfg.color }}
        aria-hidden="true"
      >
        {cfg.icon}
      </span>
      <span className="sync-label" style={{ color: cfg.color }}>
        {cfg.label}
        {status.state === 'offline' && status.pendingCount > 0 && (
          <span className="sync-queue-count"> ({status.pendingCount})</span>
        )}
        {status.state === 'error' && (
          <span className="sync-queue-count"> ({status.dlqCount} errors)</span>
        )}
      </span>
    </div>
  );
}
