/**
 * Precio por cubeta de cada variedad del huerto. Cada cubeta se paga al precio
 * de la variedad de la fila donde se recogió; si la variedad no tiene precio,
 * al precio normal (Piece Rate de arriba).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import {
    loadOrchardVarietyRates,
    saveOrchardVarietyRate,
    type OrchardVarietyRate,
} from '@/repositories/pay-rates.repository';
import { logger } from '@/utils/logger';
import { formatNZD } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

export const VarietyRatesEditor: React.FC<{ orchardId?: string; defaultRate: number }> = ({ orchardId, defaultRate }) => {
    const { t } = useTranslation();
    const [rows, setRows] = useState<OrchardVarietyRate[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    const load = useCallback(async () => {
        if (!orchardId) return;
        try {
            const list = await loadOrchardVarietyRates(orchardId);
            setRows(list);
            setDrafts(Object.fromEntries(list.map(r => [r.variety, r.orchardRate != null ? String(r.orchardRate) : ''])));
            // El panel en vivo usa los mismos precios
            useHarvestStore.setState(s => s.settings ? {
                settings: {
                    ...s.settings,
                    variety_rates: list.flatMap(r => [
                        ...(r.orchardRate != null ? [{ orchard_id: orchardId, variety: r.variety, piece_rate: r.orchardRate }] : []),
                        ...(r.companyRate != null ? [{ orchard_id: null, variety: r.variety, piece_rate: r.companyRate }] : []),
                    ]),
                },
            } : {});
        } catch (e) {
            logger.warn('[VarietyRates] load failed', e);
        }
    }, [orchardId]);

    useEffect(() => { load(); }, [load]);

    const save = async (variety: string) => {
        if (!orchardId) return;
        const raw = (drafts[variety] ?? '').trim();
        const value = raw === '' ? null : Number(raw);
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
            setMessage({ text: t('variety.invalid', { variety }), ok: false });
            return;
        }
        setSaving(variety);
        try {
            await saveOrchardVarietyRate(orchardId, variety, value);
            setMessage({ text: `${variety}: ${value === null ? t('variety.uses_default') : t('variety.per_bucket', { price: formatNZD(value) })}`, ok: true });
            await load();
        } catch (e) {
            setMessage({ text: e instanceof Error ? e.message : t('variety.save_failed'), ok: false });
        } finally {
            setSaving(null);
        }
    };

    if (!orchardId) return null;

    return (
        <div className="pt-3 mt-2 border-t border-border-light" data-testid="variety-rates-editor">
            <p className="text-sm font-bold text-text-main">{t('variety.title')}</p>
            <p className="text-xs text-text-muted mb-2">
                {t('variety.hint', { price: formatNZD(defaultRate) })}
            </p>
            {rows.length === 0 ? (
                <p className="text-xs text-text-muted">{t('variety.none')}</p>
            ) : (
                <div className="space-y-1.5">
                    {rows.map(r => (
                        <div key={r.variety} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="text-sm font-medium text-text-sub min-w-0 break-words">
                                {r.variety}
                                {r.orchardRate == null && r.companyRate != null && (
                                    <span className="ml-2 text-[11px] text-text-muted">{t('variety.company', { price: formatNZD(r.companyRate) })}</span>
                                )}
                            </span>
                            <div className="flex items-center gap-1.5 ml-auto">
                                <span className="text-sm text-text-muted">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.10"
                                    inputMode="decimal"
                                    aria-label={t('variety.price_aria', { variety: r.variety })}
                                    placeholder={defaultRate.toFixed(2)}
                                    value={drafts[r.variety] ?? ''}
                                    onChange={e => setDrafts(d => ({ ...d, [r.variety]: e.target.value }))}
                                    className="w-20 text-right text-sm border border-border-light rounded-lg px-2 py-1.5 bg-surface-white text-text-main"
                                />
                                <button
                                    type="button"
                                    onClick={() => save(r.variety)}
                                    disabled={saving === r.variety || (drafts[r.variety] ?? '') === (r.orchardRate != null ? String(r.orchardRate) : '')}
                                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
                                >
                                    {saving === r.variety ? '…' : t('common.save')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {message && (
                <p role="status" className={`mt-2 text-xs font-bold ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
            )}
        </div>
    );
};

export default VarietyRatesEditor;
