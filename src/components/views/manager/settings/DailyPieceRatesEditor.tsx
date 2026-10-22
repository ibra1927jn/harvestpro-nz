/**
 * Precio por cubeta de HOY (decisión del dueño 2026-10-23): el precio vive por
 * huerto, variedad y día. Guardar escribe la fila de hoy (día NZ) en
 * piece_rates; los días anteriores conservan su precio y, si mañana nadie lo
 * cambia, sigue valiendo el de hoy.
 *
 * - Precio general del huerto (las variedades sin precio propio cobran este).
 * - Un precio por cada variedad de las filas del huerto (block_rows).
 * - Al lado, el precio de ayer; debajo, el historial plegable de 14 días.
 *
 * El precio general de hoy también se copia a harvest_settings.piece_rate
 * (compatibilidad: lo leen el asistente y lo que aún no carga piece_rates).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { pieceRatesRepository, toDailyPieceRate, type PieceRateRow } from '@/repositories/piece-rates.repository';
import { settingsRepository } from '@/repositories/settings.repository';
import { pieceRateOn, type DailyPieceRate } from '@/services/harvestMetrics/pay';
import { addDaysYMD, todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { formatNZD } from '@/utils/nzFormat';
import { useTranslation } from '@/i18n';

const GENERAL = '__general__';
const HISTORY_DAYS = 14;

interface RateLine {
    key: string;
    /** null = general del huerto */
    variety: string | null;
    today: number;
    yesterday: number;
    /** La variedad tiene precio propio hoy (si no, cobra el general) */
    own: boolean;
    /** Hay una fila fijada hoy (se puede deshacer) */
    setToday: boolean;
}

/** Líneas de precio (general + variedades) de hoy y ayer a partir de las filas cargadas */
export function buildRateLines(
    rows: ReadonlyArray<DailyPieceRate>,
    orchardId: string,
    varieties: ReadonlyArray<string>,
    fallback: number,
    today: string,
): RateLine[] {
    const yesterday = addDaysYMD(today, -1);
    const lower = (v: string | null) => (v ?? '').trim().toLowerCase();
    const isSetToday = (v: string | null) => rows.some(r => r.effectiveDate === today && lower(r.variety) === lower(v));
    const hasOwn = (v: string) => rows.some(r => r.variety !== null && lower(r.variety) === lower(v) && r.effectiveDate <= today);
    const general: RateLine = {
        key: GENERAL,
        variety: null,
        today: pieceRateOn(rows, orchardId, null, today, fallback),
        yesterday: pieceRateOn(rows, orchardId, null, yesterday, fallback),
        own: true,
        setToday: isSetToday(null),
    };
    // Variedades de las filas y las que ya tienen precio aunque no estén en filas
    const names = new Map<string, string>();
    for (const v of varieties) if (v.trim()) names.set(lower(v), v.trim());
    for (const r of rows) if (r.variety && !names.has(lower(r.variety))) names.set(lower(r.variety), r.variety.trim());
    const lines = [...names.values()].sort((a, b) => a.localeCompare(b)).map(v => ({
        key: v,
        variety: v,
        today: pieceRateOn(rows, orchardId, v, today, fallback),
        yesterday: pieceRateOn(rows, orchardId, v, yesterday, fallback),
        own: hasOwn(v),
        setToday: isSetToday(v),
    }));
    return [general, ...lines];
}

export const DailyPieceRatesEditor: React.FC<{
    orchardId?: string;
    /** Avisa del precio general de hoy (el formulario lo usa para el objetivo de cubetas/hora) */
    onGeneralRateChange?: (rate: number) => void;
}> = ({ orchardId, onGeneralRateChange }) => {
    const { t, locale } = useTranslation();
    const storedRate = useHarvestStore(s => s.settings?.piece_rate ?? 0);
    const [today, setToday] = useState(() => todayNZST());
    const [history, setHistory] = useState<PieceRateRow[]>([]);
    const [varieties, setVarieties] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    // Precio de reserva estable (el del store al abrir): si no, cada guardado lo movería
    const [fallback] = useState(storedRate);

    const rates = useMemo(() => history.map(toDailyPieceRate), [history]);
    const lines = useMemo(
        () => (orchardId ? buildRateLines(rates, orchardId, varieties, fallback, today) : []),
        [rates, orchardId, varieties, fallback, today],
    );

    const load = useCallback(async () => {
        if (!orchardId) return;
        const day = todayNZST();
        setToday(day);
        try {
            const [rows, names] = await Promise.all([
                pieceRatesRepository.loadHistory(orchardId, HISTORY_DAYS, day),
                pieceRatesRepository.loadOrchardVarieties(orchardId).catch(() => [] as string[]),
            ]);
            setHistory(rows);
            setVarieties(names);
            const daily = rows.map(toDailyPieceRate);
            const general = pieceRateOn(daily, orchardId, null, day, fallback);
            // Lo que ven el TL, el runner y el panel: los precios que valen hoy
            useHarvestStore.setState(s => s.settings ? {
                settings: { ...s.settings, piece_rate: general, piece_rates: daily.filter(r => r.effectiveDate <= day) },
            } : {});
            onGeneralRateChange?.(general);
            setDrafts({});
        } catch (e) {
            logger.warn('[PieceRates] load failed', e);
        }
    }, [orchardId, fallback, onGeneralRateChange]);

    useEffect(() => { void load(); }, [load]);

    const nameOf = (line: RateLine) => line.variety ?? t('pieceRates.general');

    const save = async (line: RateLine) => {
        if (!orchardId) return;
        const raw = (drafts[line.key] ?? '').trim();
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value) || value < 0) {
            setMessage({ text: t('pieceRates.invalid', { name: nameOf(line) }), ok: false });
            return;
        }
        setSaving(line.key);
        try {
            await pieceRatesRepository.setForDay(orchardId, line.variety, value, today);
            // Compatibilidad: harvest_settings.piece_rate = precio general de hoy
            if (line.variety === null) await settingsRepository.upsert(orchardId, { piece_rate: value });
            setMessage({ text: t('pieceRates.saved', { name: nameOf(line), price: formatNZD(value) }), ok: true });
            await load();
        } catch (e) {
            logger.warn('[PieceRates] save failed', e);
            setMessage({ text: t('pieceRates.save_failed'), ok: false });
        } finally {
            setSaving(null);
        }
    };

    const clear = async (line: RateLine) => {
        if (!orchardId || line.variety === null) return;
        setSaving(line.key);
        try {
            await pieceRatesRepository.clearForDay(orchardId, line.variety, today);
            setMessage({ text: t('pieceRates.cleared', { name: nameOf(line) }), ok: true });
            await load();
        } catch (e) {
            logger.warn('[PieceRates] clear failed', e);
            setMessage({ text: t('pieceRates.save_failed'), ok: false });
        } finally {
            setSaving(null);
        }
    };

    if (!orchardId) return null;

    const dateLabel = (ymd: string) => {
        try {
            return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-NZ' : locale, {
                weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
            });
        } catch {
            return ymd;
        }
    };

    const since = addDaysYMD(today, -HISTORY_DAYS);
    const changes = history
        .filter(r => String(r.effective_date).slice(0, 10) >= since)
        .sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)) || (a.variety ?? '').localeCompare(b.variety ?? ''));

    const renderLine = (line: RateLine) => {
        const draft = drafts[line.key] ?? '';
        return (
            <div key={line.key} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1" data-testid={`piece-rate-${line.variety ?? 'general'}`}>
                <span className="text-sm font-medium text-text-sub min-w-0 break-words">
                    {nameOf(line)}
                    <span className="ml-2 text-[11px] text-text-muted">
                        {formatNZD(line.today)}
                        {!line.own && ` · ${t('pieceRates.uses_general')}`}
                        {' · '}
                        {t('pieceRates.yesterday', { price: formatNZD(line.yesterday) })}
                    </span>
                </span>
                <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-sm text-text-muted">$</span>
                    <input
                        type="number"
                        min="0"
                        step="0.10"
                        inputMode="decimal"
                        aria-label={t('pieceRates.price_aria', { name: nameOf(line) })}
                        placeholder={line.today.toFixed(2)}
                        value={draft}
                        onChange={e => setDrafts(d => ({ ...d, [line.key]: e.target.value }))}
                        className="w-20 text-right text-sm border border-border-light rounded-lg px-2 py-1.5 bg-surface-white text-text-main"
                    />
                    <button
                        type="button"
                        onClick={() => void save(line)}
                        disabled={saving === line.key || draft.trim() === ''}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
                    >
                        {saving === line.key ? '…' : t('common.save')}
                    </button>
                    {line.variety !== null && line.setToday && (
                        <button
                            type="button"
                            onClick={() => void clear(line)}
                            disabled={saving === line.key}
                            className="text-xs font-bold px-2 py-1.5 rounded-lg border border-border-light text-text-sub disabled:opacity-40"
                        >
                            {t('pieceRates.clear')}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const [general, ...byVariety] = lines;

    return (
        <div className="py-1" data-testid="daily-piece-rates-editor">
            <p className="text-sm font-bold text-text-main">{t('pieceRates.title', { date: dateLabel(today) })}</p>
            <p className="text-xs text-text-muted mb-2">{t('pieceRates.hint')}</p>
            {general && renderLine(general)}
            <p className="text-[11px] text-text-muted mt-1 mb-2">{t('pieceRates.general_hint')}</p>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest mb-1.5">{t('pieceRates.varieties')}</p>
            {byVariety.length === 0
                ? <p className="text-xs text-text-muted">{t('pieceRates.none')}</p>
                : <div className="space-y-1.5">{byVariety.map(renderLine)}</div>}
            {message && (
                <p role="status" className={`mt-2 text-xs font-bold ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
            )}
            <details className="mt-3 text-xs" data-testid="piece-rates-history">
                <summary className="cursor-pointer font-bold text-text-sub">{t('pieceRates.history')}</summary>
                {changes.length === 0
                    ? <p className="mt-1 text-text-muted">{t('pieceRates.history_empty')}</p>
                    : (
                        <ul className="mt-1 space-y-0.5">
                            {changes.map(r => (
                                <li key={r.id} className="flex justify-between gap-2 text-text-sub">
                                    <span>{dateLabel(String(r.effective_date).slice(0, 10))} · {r.variety ?? t('pieceRates.general')}</span>
                                    <span className="tabular-nums">{formatNZD(Number(r.piece_rate))}</span>
                                </li>
                            ))}
                        </ul>
                    )}
            </details>
        </div>
    );
};

export default DailyPieceRatesEditor;
