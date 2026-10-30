/**
 * ManagerSetupWizard — «Configura tu huerto» (B4, auditoría 2026-10-23).
 *
 * El manager no puede crear huertos (setup_orchard_atomic es solo de admin):
 * el asistente antiguo acababa en «Only an admin can create orchards». Para el
 * manager el primer arranque configura SU huerto: meta del día
 * (harvest_settings.target_tons), precio por cubeta de hoy (piece_rates, solo
 * cuenta desde hoy) y la variedad de las filas de cada bloque (block_rows).
 * Crear huertos sigue en Admin (SetupWizard). Si el huerto no tiene bloques
 * ni filas, enlaza a «Estructura del huerto» (temporadas, bloques y filas).
 */
import React, { useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { settingsService } from '@/services/settings.service';
import { pieceRatesRepository } from '@/repositories/piece-rates.repository';
import { orchardMapRepository } from '@/repositories/orchard-map.repository';
import { useTranslation } from '@/i18n';
import { logger } from '@/utils/logger';
import { changedVarieties, dominantVariety, validateSetup, type ManagerSetupForm } from './managerSetupLogic';

interface ManagerSetupWizardProps {
    onComplete: () => void;
    onCancel: () => void;
    /** Huerto sin bloques ni filas: abre «Estructura del huerto» */
    onOpenStructure?: () => void;
}

const ManagerSetupWizard: React.FC<ManagerSetupWizardProps> = ({ onComplete, onCancel, onOpenStructure }) => {
    const { t } = useTranslation();
    const dialogRef = useRef<HTMLDivElement>(null);
    useDialogA11y(dialogRef, { onClose: onCancel });
    const orchard = useHarvestStore(s => s.orchard);
    const settings = useHarvestStore(s => s.settings);
    const blocks = useHarvestStore(s => s.orchardBlocks);

    const originalVarieties = useMemo(
        () => Object.fromEntries(blocks.map(b => [b.id, dominantVariety(b.rowVarieties)])),
        [blocks]
    );
    const [form, setForm] = useState<ManagerSetupForm>(() => ({
        targetTons: String(settings?.target_tons ?? 40),
        pieceRate: settings?.piece_rate ? String(settings.piece_rate) : '',
        varieties: { ...originalVarieties },
    }));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const invalid = validateSetup(form);
        if (invalid) {
            setError(t(invalid === 'target' ? 'msetup.err.target' : 'msetup.err.rate'));
            return;
        }
        if (!orchard?.id) {
            setError(t('msetup.err.no_orchard'));
            return;
        }
        setSaving(true);
        try {
            const target = Number(form.targetTons);
            const res = await settingsService.updateHarvestSettings(orchard.id, { target_tons: target });
            if (!res.ok) throw new Error(res.reason);
            await pieceRatesRepository.setForDay(orchard.id, null, Number(form.pieceRate));
            for (const { blockId, variety } of changedVarieties(form.varieties, originalVarieties)) {
                await orchardMapRepository.setBlockVariety(blockId, variety);
            }
            useHarvestStore.setState(state => ({
                settings: { ...state.settings, target_tons: target, piece_rate: Number(form.pieceRate) },
            }));
            onComplete();
        } catch (err) {
            logger.error('[ManagerSetup] Save failed:', err);
            setError(t('msetup.err.save', { error: err instanceof Error ? err.message : String(err) }));
        } finally {
            setSaving(false);
        }
    };

    const field = 'w-full px-3 py-2 rounded-lg border border-border-light text-sm bg-white';

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="manager-setup-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                    <div>
                        <h2 id="manager-setup-title" className="text-lg font-semibold text-text-primary">{t('msetup.title')}</h2>
                        <p className="text-xs text-text-secondary">{orchard?.name ?? ''}</p>
                    </div>
                    <button type="button" onClick={onCancel} className="text-text-muted hover:text-text-secondary" aria-label={t('common.close')}>
                        <span aria-hidden="true" className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form onSubmit={save} className="flex-1 overflow-y-auto p-6 space-y-5">
                    <label className="block text-sm font-semibold text-text-primary">
                        {t('msetup.target')}
                        <span className="block text-xs font-normal text-text-secondary mb-1">{t('msetup.target_hint')}</span>
                        <input type="number" min="1" step="1" inputMode="decimal" value={form.targetTons}
                            onChange={e => setForm(f => ({ ...f, targetTons: e.target.value }))} className={field} />
                    </label>
                    <label className="block text-sm font-semibold text-text-primary">
                        {t('msetup.rate')}
                        <span className="block text-xs font-normal text-text-secondary mb-1">{t('msetup.rate_hint')}</span>
                        <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.pieceRate}
                            onChange={e => setForm(f => ({ ...f, pieceRate: e.target.value }))} className={field} />
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold text-text-primary">{t('msetup.varieties')}</legend>
                        <p className="text-xs text-text-secondary">{t('msetup.varieties_hint')}</p>
                        {blocks.length === 0 ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 space-y-2" data-testid="msetup-no-blocks">
                                <p className="text-xs">{t('msetup.no_blocks')}</p>
                                {onOpenStructure && (
                                    <button type="button" onClick={onOpenStructure} data-testid="msetup-open-structure"
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">
                                        <span aria-hidden="true" className="material-symbols-outlined text-sm">grid_view</span>
                                        {t('msetup.open_structure')}
                                    </button>
                                )}
                            </div>
                        ) : blocks.map(b => (
                            <label key={b.id} className="flex items-center gap-3 text-sm text-text-primary">
                                <span className="w-32 shrink-0 truncate">{t('msetup.block_rows', { name: b.name, n: b.totalRows })}</span>
                                <input type="text" value={form.varieties[b.id] ?? ''} maxLength={60}
                                    aria-label={t('msetup.variety_of', { name: b.name })}
                                    onChange={e => setForm(f => ({ ...f, varieties: { ...f.varieties, [b.id]: e.target.value } }))}
                                    className={field} />
                            </label>
                        ))}
                    </fieldset>
                    <p className="text-xs text-text-muted">{t('msetup.teams_note')}</p>
                    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary">{t('common.cancel')}</button>
                        <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? t('msetup.saving') : t('msetup.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ManagerSetupWizard;
