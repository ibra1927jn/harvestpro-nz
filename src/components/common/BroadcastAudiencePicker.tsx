/** Destinatarios de un aviso: todos (por defecto) o team leaders / runners / QC / oficina */
import React from 'react';
import { BROADCAST_AUDIENCES, toggleAudience, type BroadcastAudience } from '@/services/broadcastAudience';
import { useTranslation } from '@/i18n';

export const BroadcastAudiencePicker: React.FC<{
    value: BroadcastAudience[];
    onChange: (next: BroadcastAudience[]) => void;
}> = ({ value, onChange }) => {
    const { t } = useTranslation();
    return (
        <div>
            <span id="broadcast-audience-label" className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('comms.audience_label')}</span>
            <div role="group" aria-labelledby="broadcast-audience-label" className="flex flex-wrap gap-2" data-testid="broadcast-audience">
                {BROADCAST_AUDIENCES.map(a => {
                    const on = value.includes(a);
                    return (
                        <button
                            key={a}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onChange(toggleAudience(value, a))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${on ? 'bg-primary text-white border-primary shadow' : 'bg-slate-50 text-text-muted border-border-light hover:text-text-sub'}`}
                        >
                            {t(`comms.audience.${a}`)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default BroadcastAudiencePicker;
