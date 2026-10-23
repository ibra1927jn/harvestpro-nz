/**
 * OrchardStep — Paso 1: datos del huerto
 * (las filas salen de los bloques del paso 2; ya no se pide un total suelto)
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import type { OrchardStepProps } from './wizard.types';

const field = 'w-full border border-border-light rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-text-main focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

const OrchardStep: React.FC<OrchardStepProps> = ({ data, onUpdate }) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="wizard-code" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.code')}</label>
                    <input
                        id="wizard-code"
                        type="text"
                        value={data.orchard.code}
                        onChange={e => onUpdate('code', e.target.value.toUpperCase())}
                        placeholder={t('owiz.code_ph')}
                        maxLength={20}
                        className={field}
                    />
                </div>
                <div>
                    <label htmlFor="wizard-name" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.name')}</label>
                    <input
                        id="wizard-name"
                        type="text"
                        value={data.orchard.name}
                        onChange={e => onUpdate('name', e.target.value)}
                        placeholder={t('owiz.name_ph')}
                        maxLength={120}
                        className={field}
                    />
                </div>
            </div>
            <div>
                <label htmlFor="wizard-location" className="block text-sm font-medium text-text-primary mb-1">{t('owiz.location')}</label>
                <input
                    id="wizard-location"
                    type="text"
                    value={data.orchard.location}
                    onChange={e => onUpdate('location', e.target.value)}
                    placeholder={t('owiz.location_ph')}
                    maxLength={200}
                    className={field}
                />
            </div>
        </div>
    );
};

export default OrchardStep;
