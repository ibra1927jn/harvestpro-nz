/**
 * BinsTab.tsx — Logistics Bin Inventory
 * Bin overview stats + individual bin cards with fill progress bars
 *
 * B6 (auditoría 2026-10-23): Logística cambia el estado de cada bin (vacío /
 * lleno / recogido) y los da de alta y de baja; el runner lo ve en vivo
 * (bins en realtime). Antes era solo lectura.
 */
import React, { useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { BinInventory, LogisticsSummary, type BinDbStatus } from '@/services/logistics-dept.service';
import { useTranslation } from '@/i18n';
import { statusLabel } from '@/i18n/statusLabel';

interface BinsTabProps {
    bins: BinInventory[];
    summary: LogisticsSummary;
    /** Cambia el estado en la BD; rechaza con el motivo si no se guardó */
    onSetStatus?: (binId: string, status: BinDbStatus) => Promise<void>;
    onAddBin?: (binCode: string, zone: string) => Promise<void>;
    onRetireBin?: (binId: string) => Promise<void>;
    readOnly?: boolean;
}

/** Estados que Logística pone a mano (a medio llenar lo pone el runner al escanear) */
const SETTABLE: BinDbStatus[] = ['empty', 'full', 'collected'];

const BinsTab: React.FC<BinsTabProps> = ({ bins, summary, onSetStatus, onAddBin, onRetireBin, readOnly = false }) => {
    const { t } = useTranslation();
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [zone, setZone] = useState('');
    const [busy, setBusy] = useState(false);
    const canEdit = !readOnly && !!onSetStatus;

    const run = async (action: () => Promise<void>, ok: string) => {
        setError(null);
        setNotice(null);
        setBusy(true);
        try {
            await action();
            setNotice(ok);
            return true;
        } catch (e) {
            setError(t('logi.bins.save_failed', { error: e instanceof Error ? e.message : String(e) }));
            return false;
        } finally {
            setBusy(false);
        }
    };

    return (
    <div className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

        {!readOnly && onAddBin && (
            <form
                className="bg-white rounded-xl p-4 shadow-sm border border-border-light flex flex-wrap items-end gap-2"
                aria-label={t('logi.bins.add')}
                onSubmit={async e => {
                    e.preventDefault();
                    if (!code.trim()) { setError(t('logi.bins.code_required')); return; }
                    const ok = await run(() => onAddBin(code.trim(), zone.trim()), t('logi.bins.added', { code: code.trim() }));
                    if (ok) { setCode(''); setZone(''); }
                }}
            >
                <label className="text-xs text-text-secondary flex flex-col">{t('logi.bins.code')}
                    <input value={code} maxLength={30} onChange={e => setCode(e.target.value)} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                </label>
                <label className="text-xs text-text-secondary flex flex-col">{t('logi.fleet.zone')}
                    <input value={zone} maxLength={20} onChange={e => setZone(e.target.value)} className="px-2 py-1.5 rounded border border-border-light text-sm" />
                </label>
                <button type="submit" disabled={busy} className="px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold disabled:opacity-50">{t('logi.bins.add')}</button>
            </form>
        )}
        {/* Bin Overview */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-border-light">
            <h3 className="font-bold text-text-primary text-sm mb-3">{t('logi.bins_overview')}</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
                {[
                    { label: t('status.empty'), count: summary.emptyBins, color: 'text-text-secondary' },
                    { label: t('status.filling'), count: bins.filter(b => b.status === 'filling').length, color: 'text-amber-600' },
                    { label: t('status.full'), count: summary.fullBins, color: 'text-red-600' },
                    { label: t('logi.transit'), count: summary.binsInTransit, color: 'text-sky-600' },
                ].map((item, i) => (
                    <div key={i}>
                        <p className={`text-xl font-black ${item.color}`}>{item.count}</p>
                        <p className="text-[10px] text-text-secondary uppercase font-bold">{item.label}</p>
                    </div>
                ))}
            </div>
        </div>

        {bins.length === 0 && (
            <EmptyState
                icon="inventory_2"
                title={t('logi.no_bins')}
                subtitle={t('logi.no_bins_desc')}
                compact
            />
        )}

        {/* Bin Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {bins.map(bin => (
                <div key={bin.id} className="bg-white rounded-xl p-4 shadow-sm border border-border-light">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-text-primary text-sm">#{bin.bin_code}</h4>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${bin.status === 'full' ? 'bg-red-50 text-red-700' :
                            bin.status === 'in_transit' ? 'bg-sky-50 text-sky-700' :
                                bin.status === 'filling' ? 'bg-amber-50 text-amber-700' :
                                    'bg-surface-secondary text-text-secondary'
                            }`}>{statusLabel(t, bin.status)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>{t('logi.zone', { zone: bin.zone })}</span>
                        <span>•</span>
                        <span>{t('logi.pct_full', { n: bin.fill_percentage })}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bin.fill_percentage > 80 ? 'bg-red-400' :
                            bin.fill_percentage > 50 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`} style={{ width: `${bin.fill_percentage}%` }} />
                    </div>
                    {canEdit && (
                        <div className="mt-3 flex items-center gap-2">
                            <select
                                value={bin.db_status}
                                aria-label={t('logi.bins.status_for', { code: bin.bin_code })}
                                disabled={busy}
                                onChange={e => {
                                    const next = e.target.value as BinDbStatus;
                                    void run(() => onSetStatus!(bin.id, next), t('logi.bins.status_saved', { code: bin.bin_code, status: statusLabel(t, next) }));
                                }}
                                className="flex-1 px-2 py-1 rounded border border-border-light text-xs bg-white"
                            >
                                {bin.db_status === 'partial' && <option value="partial">{statusLabel(t, 'filling')}</option>}
                                {SETTABLE.map(st => <option key={st} value={st}>{statusLabel(t, st)}</option>)}
                            </select>
                            {onRetireBin && (
                                <button type="button"
                                    aria-label={t('logi.bins.retire_for', { code: bin.bin_code })}
                                    title={t('logi.bins.retire')}
                                    onClick={() => {
                                        if (!window.confirm(t('logi.bins.confirm_retire', { code: bin.bin_code }))) return;
                                        void run(() => onRetireBin(bin.id), t('logi.bins.retired', { code: bin.bin_code }));
                                    }}
                                    className="p-1.5 rounded-md text-text-muted hover:text-red-600 hover:bg-red-50">
                                    <span aria-hidden="true" className="material-symbols-outlined text-base">delete</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
    );
};

export default BinsTab;
