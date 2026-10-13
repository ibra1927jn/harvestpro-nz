/**
 * DaySettingsModal - Modal for configuring daily settings
 * Extracted from Manager.tsx — now using unified light theme + ModalOverlay
 */

import React, { useState } from 'react';
import ModalOverlay from '@/components/ui/ModalOverlay';
import { formatNZD } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

interface DaySettings {
    bucketRate?: number;
    targetTons?: number;
    startTime?: string;
    teams?: string[];
}

interface DaySettingsModalProps {
    settings: DaySettings;
    onClose: () => void;
    onSave: (settings: DaySettings) => void;
    minWage?: number;
}

const DaySettingsModal: React.FC<DaySettingsModalProps> = ({ settings, onClose, onSave, minWage = 23.95 }) => {
    const { t } = useTranslation();
    const [bucketRate, setBucketRate] = useState(settings.bucketRate?.toString() || '6.50');
    const [targetTons, setTargetTons] = useState(settings.targetTons?.toString() || '40');

    const handleSave = () => {
        onSave({
            ...settings,
            bucketRate: parseFloat(bucketRate),
            targetTons: parseFloat(targetTons)
        });
        onClose();
    };

    return (
        <ModalOverlay onClose={onClose}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-light">
                <h3 className="text-lg font-bold text-text-main">{t('dayset.title')}</h3>
                <button aria-label={t('common.close')} onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
                    <span aria-hidden="true" className="material-symbols-outlined">close</span>
                </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
                <div>
                    <label className="text-xs font-semibold text-text-muted uppercase mb-2 block">{t('dayset.bucket_rate')}</label>
                    <input
                        type="number"
                        step="0.50"
                        value={bucketRate}
                        onChange={(e) => setBucketRate(e.target.value)}
                        aria-label={t('dayset.bucket_rate_aria')}
                        className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main font-mono text-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                </div>
                <div>
                    <label className="text-xs font-semibold text-text-muted uppercase mb-2 block">{t('dayset.target')}</label>
                    <input
                        type="number"
                        value={targetTons}
                        onChange={(e) => setTargetTons(e.target.value)}
                        aria-label={t('dayset.target_aria')}
                        className="w-full bg-slate-50 border border-border-light rounded-xl px-4 py-3 text-text-main font-mono text-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                </div>

                {/* Info panel */}
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                    <p className="text-xs font-semibold text-primary uppercase mb-2">{t('dayset.minimums')}</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-lg font-bold text-text-main">{formatNZD(minWage)}{t('common.per_hour')}</p>
                            <p className="text-xs text-text-muted">{t('dayset.min_wage')}</p>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-text-main">{(minWage / parseFloat(bucketRate || '6.50')).toFixed(1)} {t('dayset.bkt_per_hr')}</p>
                            <p className="text-xs text-text-muted">{t('dayset.min_rate')}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-5 pt-0">
                <button
                    onClick={handleSave}
                    className="w-full py-3.5 gradient-primary glow-primary text-white rounded-xl font-bold text-sm uppercase tracking-wide hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                    {t('dayset.save')}
                </button>
            </div>
        </ModalOverlay>
    );
};

export default DaySettingsModal;
