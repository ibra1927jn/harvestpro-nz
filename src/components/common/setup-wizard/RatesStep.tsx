/**
 * RatesStep — Paso 3: precio por cubeta, variedad principal y hora de inicio
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import type { RatesStepProps } from './wizard.types';
import { VARIETIES } from './wizard.types';

const field = 'w-full border border-border-light rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-text-main focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

const RatesStep: React.FC<RatesStepProps> = ({ data, onUpdate }) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('owiz.rates_intro')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="wizard-variety" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.primary_variety')}</label>
                    <input
                        id="wizard-variety"
                        list="wizard-rate-varieties"
                        value={data.rates.variety}
                        maxLength={60}
                        onChange={e => onUpdate('variety', e.target.value)}
                        className={field}
                    />
                    <datalist id="wizard-rate-varieties">
                        {VARIETIES.map(v => <option key={v} value={v} />)}
                    </datalist>
                </div>
                <div>
                    <label htmlFor="wizard-piece-rate" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.piece_rate')}</label>
                    <input
                        id="wizard-piece-rate"
                        type="number"
                        min={0.1}
                        step={0.05}
                        value={data.rates.piece_rate}
                        onChange={e => onUpdate('piece_rate', parseFloat(e.target.value) || 0)}
                        className={field}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="wizard-start-time" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.start_time')}</label>
                <input
                    id="wizard-start-time"
                    type="time"
                    value={data.rates.start_time}
                    onChange={e => onUpdate('start_time', e.target.value)}
                    className={`${field} w-40`}
                />
            </div>
        </div>
    );
};

export default RatesStep;
