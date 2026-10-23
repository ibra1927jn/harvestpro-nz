/**
 * SummaryStep — Paso 4: revisar y confirmar
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { totalSetupRows } from '@/services/setup.service';
import type { SummaryStepProps } from './wizard.types';

const SummaryStep: React.FC<SummaryStepProps> = ({ data, error }) => {
    const { t } = useTranslation();
    const item = (labelKey: string, value: string) => (
        <div><span className="text-text-secondary">{t(labelKey)}</span> <span className="font-medium text-text-main">{value}</span></div>
    );
    return (
        <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">park</span>
                    {t('owiz.sum.orchard')}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    {item('owiz.sum.code', data.orchard.code)}
                    {item('owiz.sum.name', data.orchard.name)}
                    {item('owiz.sum.location', data.orchard.location || '—')}
                    {item('owiz.sum.rows', String(totalSetupRows(data.blocks)))}
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">grid_view</span>
                    {t('owiz.sum.season', { name: data.season.name })}
                </h3>
                <ul className="text-sm space-y-1">
                    {data.blocks.map((b, i) => (
                        <li key={i} className="text-text-main">
                            {t('owiz.sum.block', { name: b.name, from: b.row_from, to: b.row_to, variety: b.variety.trim() || data.rates.variety, target: b.target_buckets })}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">payments</span>
                    {t('owiz.sum.rates')}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    {item('owiz.sum.variety', data.rates.variety)}
                    {item('owiz.sum.rate', t('owiz.sum.rate_value', { rate: data.rates.piece_rate.toFixed(2) }))}
                    {item('owiz.sum.start', data.rates.start_time)}
                </div>
            </div>

            <p className="text-xs text-text-secondary">{t('owiz.teams_note')}</p>

            {error && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">error</span>
                    {error}
                </div>
            )}
        </div>
    );
};

export default SummaryStep;
