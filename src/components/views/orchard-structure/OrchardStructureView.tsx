/**
 * OrchardStructureView — «Estructura del huerto»: temporadas, bloques y filas
 *
 * Para el admin (cualquier huerto, desde Admin › Estructura) y el manager (su
 * huerto, desde su menú). Sin esto un cliente nuevo no podía montar su huerto:
 * ninguna pantalla escribía harvest_seasons, orchard_blocks ni block_rows.
 *
 *   Temporadas: crear (copiando bloques y filas de otra si se quiere), fechas,
 *               activar (cierra la activa anterior) y cerrar.
 *   Bloques:    crear (con sus filas en un paso), renombrar, archivar.
 *   Filas:      en lote («filas 1–15»), variedad y objetivo por rango
 *               («filas 1–15 Royal Gala»), edición una a una y archivado.
 *
 * Es trabajo de oficina con conexión: si falla la red se dice. Cada cambio es
 * una sola llamada a la base y una sola transacción (crear temporada con copia
 * y activación, o bloque con sus filas, incluidos): nunca queda nada a medias.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { todayNZST } from '@/utils/nzst';
import {
    orchardStructureRepository as repo,
    BLOCK_COLORS,
    type BlockRow,
    type OrchardRowRecord,
    type SeasonRow,
    type SeasonStatus,
} from '@/repositories/orchard-structure.repository';
import { useOrchardStructure } from './useOrchardStructure';
import {
    cleanVariety, compactRanges, nextFreeRow, parseRowRange, parseTarget, seasonYears, varietySummary,
} from './structureLogic';

interface OrchardStructureViewProps {
    orchardId: string | null | undefined;
    orchardName?: string;
}

const input = 'w-full px-3 py-2 rounded-lg border border-border-light bg-white dark:bg-slate-800 text-sm text-text-main';
const smallInput = 'px-2 py-1.5 rounded-lg border border-border-light bg-white dark:bg-slate-800 text-sm text-text-main';
const primaryBtn = 'inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50';
const ghostBtn = 'inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border-light text-sm font-medium text-text-main hover:bg-background-light disabled:opacity-50';
const label = 'block text-xs font-semibold text-text-sub mb-1';

const STATUS_CLASS: Record<SeasonStatus, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    planning: 'bg-blue-100 text-blue-800',
    closed: 'bg-slate-200 text-slate-700',
    archived: 'bg-slate-200 text-slate-700',
};

const OrchardStructureView: React.FC<OrchardStructureViewProps> = ({ orchardId, orchardName }) => {
    const { t } = useTranslation();
    const s = useOrchardStructure(orchardId);
    const [blockId, setBlockId] = useState<string | null>(null);

    const season = s.seasons.find(x => x.id === s.seasonId) ?? null;
    const block = s.blocks.find(b => b.id === blockId) ?? null;
    const rowsByBlock = useMemo(() => {
        const m = new Map<string, OrchardRowRecord[]>();
        for (const r of s.rows) {
            const list = m.get(r.block_id) ?? [];
            list.push(r);
            m.set(r.block_id, list);
        }
        return m;
    }, [s.rows]);

    if (!orchardId) {
        return <p className="p-6 text-sm text-text-muted">{t('ostruct.no_orchard')}</p>;
    }

    return (
        <div className="p-4 md:p-6 max-w-[1100px] mx-auto pb-36 space-y-5" data-testid="orchard-structure">
            <header className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <span aria-hidden="true" className="material-symbols-outlined text-emerald-600">park</span>
                </div>
                <div>
                    <h2 className="text-lg font-bold text-text-main">{t('ostruct.title')}</h2>
                    <p className="text-xs text-text-sub">{orchardName ? t('ostruct.subtitle_of', { orchard: orchardName }) : t('ostruct.subtitle')}</p>
                </div>
            </header>

            {s.error && (
                <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <span>{t(s.error.key, s.error.params)}</span>
                    <button type="button" onClick={s.clearError} aria-label={t('common.close')} className="text-red-700">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}

            {s.loading && s.seasons.length === 0 ? (
                <p className="text-sm text-text-muted" role="status">{t('common.loading')}</p>
            ) : (
                <>
                    <SeasonsSection
                        orchardId={orchardId}
                        seasons={s.seasons}
                        season={season}
                        busy={s.busy}
                        onSelect={id => { setBlockId(null); s.selectSeason(id); }}
                        run={s.run}
                    />
                    {season && (
                        <BlocksSection
                            season={season}
                            blocks={s.blocks}
                            rows={s.rows}
                            rowsByBlock={rowsByBlock}
                            selectedBlockId={blockId}
                            busy={s.busy}
                            onOpenBlock={setBlockId}
                            run={s.run}
                        />
                    )}
                    {season && block && (
                        <RowsSection
                            block={block}
                            rows={rowsByBlock.get(block.id) ?? []}
                            busy={s.busy}
                            run={s.run}
                            onClose={() => setBlockId(null)}
                        />
                    )}
                </>
            )}
        </div>
    );
};

type Run = ReturnType<typeof useOrchardStructure>['run'];

/* ── Temporadas ─────────────────────────────────────────────────────────── */

function SeasonsSection({ orchardId, seasons, season, busy, onSelect, run }: {
    orchardId: string;
    seasons: SeasonRow[];
    season: SeasonRow | null;
    busy: boolean;
    onSelect: (id: string) => void;
    run: Run;
}) {
    const { t } = useTranslation();
    const today = todayNZST();
    const [creating, setCreating] = useState(seasons.length === 0);
    const [name, setName] = useState(() => t('ostruct.season_default', { years: seasonYears(today) }));
    const [start, setStart] = useState(today);
    const [end, setEnd] = useState('');
    const [copyFrom, setCopyFrom] = useState('');
    const [activateNow, setActivateNow] = useState(() => !seasons.some(x => x.status === 'active'));
    const [localError, setLocalError] = useState<string | null>(null);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        if (!name.trim() || !start) { setLocalError(t('ostruct.err.season_fields')); return; }
        if (end && end < start) { setLocalError(t('ostruct.err.dates')); return; }
        const ok = await run(
            () => repo.createSeason({ orchardId, name, startDate: start, endDate: end || null, copyFrom: copyFrom || null, activate: activateNow }),
            { selectSeason: id => (typeof id === 'string' ? id : null) },
        );
        if (ok) { setCreating(false); setCopyFrom(''); }
    };

    return (
        <section className="glass-card p-4 space-y-3" aria-labelledby="ostruct-seasons">
            <div className="flex items-center justify-between gap-2">
                <h3 id="ostruct-seasons" className="text-sm font-bold text-text-main flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-emerald-600">calendar_month</span>
                    {t('ostruct.seasons')}
                </h3>
                {!creating && (
                    <button type="button" className={ghostBtn} onClick={() => setCreating(true)} data-testid="ostruct-new-season">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
                        {t('ostruct.new_season')}
                    </button>
                )}
            </div>

            {seasons.length === 0 && !creating && <p className="text-sm text-text-muted">{t('ostruct.no_seasons')}</p>}

            {seasons.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {seasons.map(x => (
                        <li key={x.id}>
                        <button
                            type="button"
                            onClick={() => onSelect(x.id)}
                            aria-pressed={x.id === season?.id}
                            className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${x.id === season?.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border-light'} text-text-main`}
                        >
                            {x.name}
                            <span className={`ml-2 px-1.5 py-0.5 rounded ${STATUS_CLASS[x.status]}`}>{t(`ostruct.status.${x.status}`)}</span>
                        </button>
                        </li>
                    ))}
                </ul>
            )}

            {season && <SeasonEditor key={season.id} season={season} busy={busy} run={run} />}

            {creating && (
                <form onSubmit={create} className="rounded-xl border border-border-light p-3 space-y-3" data-testid="ostruct-season-form">
                    <p className="text-sm font-semibold text-text-main">{t('ostruct.new_season')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="sm:col-span-1">
                            <span className={label}>{t('ostruct.season_name')}</span>
                            <input className={input} value={name} maxLength={80} onChange={e => setName(e.target.value)} data-testid="ostruct-season-name" />
                        </label>
                        <label>
                            <span className={label}>{t('ostruct.start_date')}</span>
                            <input type="date" className={input} value={start} onChange={e => setStart(e.target.value)} />
                        </label>
                        <label>
                            <span className={label}>{t('ostruct.end_date_optional')}</span>
                            <input type="date" className={input} value={end} min={start} onChange={e => setEnd(e.target.value)} />
                        </label>
                    </div>
                    {seasons.length > 0 && (
                        <label className="block">
                            <span className={label}>{t('ostruct.copy_from')}</span>
                            <select className={input} value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
                                <option value="">{t('ostruct.copy_none')}</option>
                                {seasons.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                        </label>
                    )}
                    <label className="flex items-center gap-2 text-sm text-text-main">
                        <input type="checkbox" checked={activateNow} onChange={e => setActivateNow(e.target.checked)} />
                        {t('ostruct.activate_now')}
                    </label>
                    {localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}
                    <div className="flex justify-end gap-2">
                        {seasons.length > 0 && <button type="button" className={ghostBtn} onClick={() => setCreating(false)}>{t('common.cancel')}</button>}
                        <button type="submit" className={primaryBtn} disabled={busy} data-testid="ostruct-create-season">
                            <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
                            {t('ostruct.create_season')}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}

function SeasonEditor({ season, busy, run }: { season: SeasonRow; busy: boolean; run: Run }) {
    const { t } = useTranslation();
    const [name, setName] = useState(season.name);
    const [start, setStart] = useState(season.start_date);
    const [end, setEnd] = useState(season.end_date ?? '');
    const dirty = name.trim() !== season.name || start !== season.start_date || (end || null) !== season.end_date;
    const [localError, setLocalError] = useState<string | null>(null);

    const save = async () => {
        setLocalError(null);
        if (!name.trim() || !start) { setLocalError(t('ostruct.err.season_fields')); return; }
        if (end && end < start) { setLocalError(t('ostruct.err.dates')); return; }
        await run(() => repo.updateSeason(season.id, { name: name.trim(), start_date: start, end_date: end || null }));
    };

    return (
        <div className="rounded-xl bg-background-light p-3 space-y-3" data-testid="ostruct-season-editor">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label>
                    <span className={label}>{t('ostruct.season_name')}</span>
                    <input className={input} value={name} maxLength={80} onChange={e => setName(e.target.value)} />
                </label>
                <label>
                    <span className={label}>{t('ostruct.start_date')}</span>
                    <input type="date" className={input} value={start} onChange={e => setStart(e.target.value)} />
                </label>
                <label>
                    <span className={label}>{t('ostruct.end_date_optional')}</span>
                    <input type="date" className={input} value={end} min={start} onChange={e => setEnd(e.target.value)} />
                </label>
            </div>
            {localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="mr-auto text-xs text-text-sub">{t(`ostruct.status_hint.${season.status}`)}</p>
                {dirty && (
                    <button type="button" className={primaryBtn} disabled={busy} onClick={save}>
                        <span aria-hidden="true" className="material-symbols-outlined text-base">save</span>
                        {t('ostruct.save_dates')}
                    </button>
                )}
                {season.status !== 'active' && (
                    <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(() => repo.activateSeason(season.id))} data-testid="ostruct-activate-season">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">event_available</span>
                        {t('ostruct.activate')}
                    </button>
                )}
                {season.status === 'active' && (
                    <button type="button" className={ghostBtn} disabled={busy}
                        onClick={() => { if (window.confirm(t('ostruct.close_confirm', { name: season.name }))) void run(() => repo.closeSeason(season.id, end || null)); }}>
                        <span aria-hidden="true" className="material-symbols-outlined text-base">event_busy</span>
                        {t('ostruct.close_season')}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── Bloques ────────────────────────────────────────────────────────────── */

function BlocksSection({ season, blocks, rows, rowsByBlock, selectedBlockId, busy, onOpenBlock, run }: {
    season: SeasonRow;
    blocks: BlockRow[];
    rows: OrchardRowRecord[];
    rowsByBlock: Map<string, OrchardRowRecord[]>;
    selectedBlockId: string | null;
    busy: boolean;
    onOpenBlock: (id: string | null) => void;
    run: Run;
}) {
    const { t } = useTranslation();
    const firstFree = nextFreeRow(blocks, rows);
    const [name, setName] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [variety, setVariety] = useState('');
    const [target, setTarget] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

    const suggestedName = t('ostruct.block_default', { letter: String.fromCharCode(65 + (blocks.length % 26)) });

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        const blockName = (name.trim() || suggestedName).slice(0, 60);
        const wantsRows = from.trim() !== '' || to.trim() !== '';
        const range = wantsRows ? parseRowRange(from, to) : null;
        if (range && !range.ok) { setLocalError(t(range.errorKey)); return; }
        const tgt = parseTarget(target);
        if (!tgt.ok) { setLocalError(t('ostruct.err.target')); return; }
        await run(() => repo.createBlock({
            seasonId: season.id,
            name: blockName,
            colorCode: BLOCK_COLORS[blocks.length % BLOCK_COLORS.length],
            rowFrom: range && range.ok ? range.from : null,
            rowTo: range && range.ok ? range.to : null,
            variety: cleanVariety(variety),
            target: tgt.value,
        }), { onSaved: () => { setName(''); setFrom(''); setTo(''); setVariety(''); setTarget(''); } });
    };

    return (
        <section className="glass-card p-4 space-y-3" aria-labelledby="ostruct-blocks">
            <h3 id="ostruct-blocks" className="text-sm font-bold text-text-main flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-base text-emerald-600">grid_view</span>
                {t('ostruct.blocks_of', { season: season.name })}
            </h3>

            {blocks.length === 0 ? (
                <p className="text-sm text-text-muted" data-testid="ostruct-no-blocks">{t('ostruct.no_blocks')}</p>
            ) : (
                <ul className="divide-y divide-border-light" data-testid="ostruct-block-list">
                    {blocks.map(b => {
                        const bRows = rowsByBlock.get(b.id) ?? [];
                        const summary = varietySummary(bRows);
                        return (
                            <li key={b.id} className="py-2 flex flex-wrap items-center gap-2" data-testid={`ostruct-block-${b.name}`}>
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color_code ?? '#dc2626' }} aria-hidden="true" />
                                {renaming?.id === b.id ? (
                                    <form className="flex items-center gap-2" onSubmit={async e => {
                                        e.preventDefault();
                                        if (!renaming.name.trim()) return;
                                        if (await run(() => repo.renameBlock(b.id, renaming.name))) setRenaming(null);
                                    }}>
                                        <input className={smallInput} value={renaming.name} maxLength={60} autoFocus
                                            aria-label={t('ostruct.block_name')}
                                            onChange={e => setRenaming({ id: b.id, name: e.target.value })} />
                                        <button type="submit" className={primaryBtn} disabled={busy}>{t('common.save')}</button>
                                        <button type="button" className={ghostBtn} onClick={() => setRenaming(null)}>{t('common.cancel')}</button>
                                    </form>
                                ) : (
                                    <span className="font-semibold text-sm text-text-main">{b.name}</span>
                                )}
                                <span className="text-xs text-text-sub">
                                    {bRows.length === 0 ? t('ostruct.block_no_rows')
                                        : t('ostruct.block_rows_summary', { n: bRows.length, ranges: compactRanges(bRows.map(r => r.row_number)) })}
                                </span>
                                {summary.length > 0 && (
                                    <span className="text-xs text-text-muted">
                                        {summary.map(v => `${v.variety ?? t('ostruct.no_variety')} ×${v.count}`).join(' · ')}
                                    </span>
                                )}
                                <span className="ml-auto flex gap-1">
                                    <button type="button" className={ghostBtn} onClick={() => onOpenBlock(selectedBlockId === b.id ? null : b.id)}
                                        aria-expanded={selectedBlockId === b.id} data-testid={`ostruct-open-${b.name}`}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">list</span>
                                        {t('ostruct.rows')}
                                    </button>
                                    <button type="button" className={ghostBtn} aria-label={t('ostruct.rename_block', { name: b.name })}
                                        onClick={() => setRenaming({ id: b.id, name: b.name })}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">edit</span>
                                    </button>
                                    <button type="button" className={ghostBtn} aria-label={t('ostruct.archive_block', { name: b.name })} disabled={busy}
                                        onClick={() => {
                                            if (!window.confirm(t('ostruct.archive_block_confirm', { name: b.name, n: bRows.length }))) return;
                                            if (selectedBlockId === b.id) onOpenBlock(null);
                                            void run(() => repo.archiveBlock(b.id));
                                        }}>
                                        <span aria-hidden="true" className="material-symbols-outlined text-base">archive</span>
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            <form onSubmit={add} className="rounded-xl border border-border-light p-3 space-y-3" data-testid="ostruct-block-form">
                <p className="text-sm font-semibold text-text-main">{t('ostruct.add_block')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <label className="col-span-2 sm:col-span-1">
                        <span className={label}>{t('ostruct.block_name')}</span>
                        <input className={input} value={name} maxLength={60} placeholder={suggestedName} onChange={e => setName(e.target.value)} data-testid="ostruct-block-name" />
                    </label>
                    <label>
                        <span className={label}>{t('ostruct.row_from')}</span>
                        <input className={input} inputMode="numeric" value={from} placeholder={String(firstFree)} onChange={e => setFrom(e.target.value)} data-testid="ostruct-block-from" />
                    </label>
                    <label>
                        <span className={label}>{t('ostruct.row_to')}</span>
                        <input className={input} inputMode="numeric" value={to} onChange={e => setTo(e.target.value)} data-testid="ostruct-block-to" />
                    </label>
                    <label>
                        <span className={label}>{t('ostruct.variety')}</span>
                        <input className={input} value={variety} maxLength={60} onChange={e => setVariety(e.target.value)} data-testid="ostruct-block-variety" />
                    </label>
                    <label>
                        <span className={label}>{t('ostruct.target')}</span>
                        <input className={input} inputMode="numeric" value={target} placeholder="100" onChange={e => setTarget(e.target.value)} />
                    </label>
                </div>
                <p className="text-xs text-text-muted">{t('ostruct.add_block_hint')}</p>
                {localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}
                <div className="flex justify-end">
                    <button type="submit" className={primaryBtn} disabled={busy} data-testid="ostruct-add-block">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">add</span>
                        {t('ostruct.add_block')}
                    </button>
                </div>
            </form>
        </section>
    );
}

/* ── Filas de un bloque ─────────────────────────────────────────────────── */

function RowsSection({ block, rows, busy, run, onClose }: {
    block: BlockRow;
    rows: OrchardRowRecord[];
    busy: boolean;
    run: Run;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'add' | 'range'>(rows.length === 0 ? 'add' : 'range');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [variety, setVariety] = useState('');
    const [target, setTarget] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        setNotice(null);
        const range = parseRowRange(from, to);
        if (!range.ok) { setLocalError(t(range.errorKey)); return; }
        const tgt = parseTarget(target);
        if (!tgt.ok) { setLocalError(t('ostruct.err.target')); return; }
        const v = cleanVariety(variety);
        if (mode === 'range' && v === null && tgt.value === null) { setLocalError(t('ostruct.err.range_nothing')); return; }
        let count = 0;
        const ok = await run(async () => {
            if (mode === 'add') {
                count = await repo.addRows(block.id, range.from, range.to, v, tgt.value);
            } else {
                const patch: { variety?: string | null; target_buckets?: number | null } = {};
                if (v !== null) patch.variety = v;
                if (tgt.value !== null) patch.target_buckets = tgt.value;
                count = await repo.updateRowsRange(block.id, range.from, range.to, patch);
            }
        });
        if (ok) {
            setNotice(t(mode === 'add' ? 'ostruct.rows_added' : 'ostruct.rows_updated', { n: count }));
            setFrom(''); setTo('');
        }
    };

    return (
        <section className="glass-card p-4 space-y-3" aria-labelledby="ostruct-rows" data-testid="ostruct-rows">
            <div className="flex items-center justify-between gap-2">
                <h3 id="ostruct-rows" className="text-sm font-bold text-text-main flex items-center gap-2">
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-emerald-600">eco</span>
                    {t('ostruct.rows_of', { block: block.name })}
                </h3>
                <button type="button" className={ghostBtn} onClick={onClose} aria-label={t('common.close')}>
                    <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
                </button>
            </div>

            <div className="flex gap-2" role="tablist">
                {(['add', 'range'] as const).map(m => (
                    <button key={m} type="button" role="tab" aria-selected={mode === m}
                        onClick={() => { setMode(m); setLocalError(null); setNotice(null); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${mode === m ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-border-light text-text-sub'}`}>
                        {t(m === 'add' ? 'ostruct.mode_add' : 'ostruct.mode_range')}
                    </button>
                ))}
            </div>

            <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end" data-testid="ostruct-rows-form">
                <label>
                    <span className={label}>{t('ostruct.row_from')}</span>
                    <input className={input} inputMode="numeric" value={from} onChange={e => setFrom(e.target.value)} data-testid="ostruct-rows-from" />
                </label>
                <label>
                    <span className={label}>{t('ostruct.row_to')}</span>
                    <input className={input} inputMode="numeric" value={to} onChange={e => setTo(e.target.value)} data-testid="ostruct-rows-to" />
                </label>
                <label>
                    <span className={label}>{t('ostruct.variety')}</span>
                    <input className={input} value={variety} maxLength={60} onChange={e => setVariety(e.target.value)} data-testid="ostruct-rows-variety" />
                </label>
                <label>
                    <span className={label}>{t('ostruct.target')}</span>
                    <input className={input} inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} data-testid="ostruct-rows-target" />
                </label>
                <button type="submit" className={`${primaryBtn} justify-center`} disabled={busy} data-testid="ostruct-rows-submit">
                    {t(mode === 'add' ? 'ostruct.add_rows' : 'ostruct.apply_range')}
                </button>
            </form>
            <p className="text-xs text-text-muted">{t(mode === 'add' ? 'ostruct.mode_add_hint' : 'ostruct.mode_range_hint')}</p>
            {localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}
            {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}

            {rows.length === 0 ? (
                <p className="text-sm text-text-muted">{t('ostruct.block_no_rows')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-text-sub">
                                <th className="py-1 pr-2">{t('ostruct.row')}</th>
                                <th className="py-1 pr-2">{t('ostruct.variety')}</th>
                                <th className="py-1 pr-2">{t('ostruct.target')}</th>
                                <th className="py-1"><span className="sr-only">{t('ostruct.actions')}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => <RowLine key={`${r.id}:${r.variety ?? ''}:${r.target_buckets ?? ''}`} row={r} busy={busy} run={run} />)}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function RowLine({ row, busy, run }: { row: OrchardRowRecord; busy: boolean; run: Run }) {
    const { t } = useTranslation();
    const [variety, setVariety] = useState(row.variety ?? '');
    const [target, setTarget] = useState(row.target_buckets == null ? '' : String(row.target_buckets));
    const [bad, setBad] = useState(false);
    const dirty = (cleanVariety(variety) ?? null) !== (row.variety ?? null)
        || (target.trim() === '' ? null : Number(target)) !== row.target_buckets;

    const save = async () => {
        const tgt = parseTarget(target);
        if (!tgt.ok) { setBad(true); return; }
        setBad(false);
        await run(() => repo.updateRow(row.id, { variety: cleanVariety(variety), target_buckets: tgt.value }));
    };

    return (
        <tr className="border-t border-border-light" data-testid={`ostruct-row-${row.row_number}`}>
            <td className="py-1 pr-2 font-semibold text-text-main">{row.row_number}</td>
            <td className="py-1 pr-2">
                <input className={`${smallInput} w-full`} value={variety} maxLength={60} placeholder={t('ostruct.no_variety')}
                    aria-label={t('ostruct.variety_of_row', { n: row.row_number })} onChange={e => setVariety(e.target.value)} />
            </td>
            <td className="py-1 pr-2">
                <input className={`${smallInput} w-20 ${bad ? 'border-red-500' : ''}`} inputMode="numeric" value={target}
                    aria-label={t('ostruct.target_of_row', { n: row.row_number })} aria-invalid={bad} onChange={e => setTarget(e.target.value)} />
            </td>
            <td className="py-1 text-right whitespace-nowrap">
                {dirty && (
                    <button type="button" className={primaryBtn} disabled={busy} onClick={save} aria-label={t('ostruct.save_row', { n: row.row_number })}>
                        <span aria-hidden="true" className="material-symbols-outlined text-base">save</span>
                    </button>
                )}
                <button type="button" className={`${ghostBtn} ml-1`} disabled={busy} aria-label={t('ostruct.archive_row', { n: row.row_number })}
                    onClick={() => { if (window.confirm(t('ostruct.archive_row_confirm', { n: row.row_number }))) void run(() => repo.archiveRow(row.id)); }}>
                    <span aria-hidden="true" className="material-symbols-outlined text-base">archive</span>
                </button>
            </td>
        </tr>
    );
}

export default OrchardStructureView;
