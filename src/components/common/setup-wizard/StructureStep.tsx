/**
 * StructureStep — Paso 2: temporada, bloques y filas del huerto nuevo
 *
 * Cada bloque lleva su rango de filas («filas 1–15»), variedad y objetivo de
 * cubetas por fila. Se crea todo junto con el huerto (setup_orchard_atomic);
 * después se cambia en «Estructura del huerto».
 */
import React from 'react';
import { useTranslation } from '@/i18n';
import { totalSetupRows, type SetupBlock } from '@/services/setup.service';
import { blockLetter, newBlock, validateStructure, VARIETIES, type StructureStepProps } from './wizard.types';

const field = 'w-full border border-border-light rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800 text-text-main focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

const toInt = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));

const StructureStep: React.FC<StructureStepProps> = ({ data, onSeason, onBlocks }) => {
    const { t } = useTranslation();
    const error = validateStructure(data);
    const update = (i: number, patch: Partial<SetupBlock>) =>
        onBlocks(data.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
    const add = () => {
        const last = data.blocks.reduce((m, b) => (Number.isFinite(b.row_to) ? Math.max(m, b.row_to) : m), 0);
        onBlocks([...data.blocks, newBlock(t('ostruct.block_default', { letter: blockLetter(data.blocks.length) }), last + 1)]);
    };

    return (
        <div className="space-y-5">
            <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-text-primary">{t('owiz.season')}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block text-xs font-medium text-text-secondary">
                        {t('ostruct.season_name')}
                        <input className={field} value={data.season.name} maxLength={80}
                            onChange={e => onSeason('name', e.target.value)} data-testid="wizard-season-name" />
                    </label>
                    <label className="block text-xs font-medium text-text-secondary">
                        {t('ostruct.start_date')}
                        <input type="date" className={field} value={data.season.start_date}
                            onChange={e => onSeason('start_date', e.target.value)} />
                    </label>
                    <label className="block text-xs font-medium text-text-secondary">
                        {t('ostruct.end_date_optional')}
                        <input type="date" className={field} value={data.season.end_date} min={data.season.start_date}
                            onChange={e => onSeason('end_date', e.target.value)} />
                    </label>
                </div>
            </fieldset>

            <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-text-primary">{t('owiz.blocks')}</legend>
                <p className="text-xs text-text-secondary">{t('owiz.blocks_hint')}</p>
                <datalist id="wizard-varieties">
                    {VARIETIES.map(v => <option key={v} value={v} />)}
                </datalist>
                {data.blocks.map((b, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1.4fr_0.8fr_auto] gap-2 items-end rounded-lg border border-border-light p-2" data-testid={`wizard-block-${i}`}>
                        <label className="col-span-2 sm:col-span-1 block text-xs text-text-secondary">
                            {t('ostruct.block_name')}
                            <input className={field} value={b.name} maxLength={60} onChange={e => update(i, { name: e.target.value })} />
                        </label>
                        <label className="block text-xs text-text-secondary">
                            {t('ostruct.row_from')}
                            <input className={field} inputMode="numeric" value={Number.isFinite(b.row_from) ? String(b.row_from) : ''}
                                onChange={e => update(i, { row_from: toInt(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-text-secondary">
                            {t('ostruct.row_to')}
                            <input className={field} inputMode="numeric" value={Number.isFinite(b.row_to) ? String(b.row_to) : ''}
                                onChange={e => update(i, { row_to: toInt(e.target.value) })} />
                        </label>
                        <label className="block text-xs text-text-secondary">
                            {t('ostruct.variety')}
                            <input className={field} list="wizard-varieties" value={b.variety} maxLength={60}
                                placeholder={data.rates.variety} onChange={e => update(i, { variety: e.target.value })} />
                        </label>
                        <label className="block text-xs text-text-secondary">
                            {t('ostruct.target')}
                            <input className={field} inputMode="numeric" value={Number.isFinite(b.target_buckets) ? String(b.target_buckets) : ''}
                                onChange={e => update(i, { target_buckets: toInt(e.target.value) })} />
                        </label>
                        <button type="button" disabled={data.blocks.length === 1}
                            onClick={() => onBlocks(data.blocks.filter((_, j) => j !== i))}
                            aria-label={t('owiz.remove_block', { name: b.name || String(i + 1) })}
                            className="h-9 px-2 rounded-lg text-text-muted hover:text-red-600 disabled:opacity-30">
                            <span aria-hidden="true" className="material-symbols-outlined text-base">delete</span>
                        </button>
                    </div>
                ))}
                <div className="flex items-center justify-between">
                    <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
                        {t('ostruct.add_block')}
                    </button>
                    <span className="text-xs text-text-secondary">{t('owiz.total_rows', { n: totalSetupRows(data.blocks.filter(b => Number.isFinite(b.row_from) && Number.isFinite(b.row_to))) })}</span>
                </div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-700" data-testid="wizard-structure-error">{t(error)}</p>}
        </div>
    );
};

export default StructureStep;
