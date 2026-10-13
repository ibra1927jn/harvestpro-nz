/**
 * nzFormat — fechas, horas, números y dinero en formato de Nueva Zelanda
 * (en-NZ, zona Pacific/Auckland, NZD), sea cual sea el idioma de la pantalla
 * o la zona horaria / idioma del móvil. Usar siempre esto en vez de
 * toLocale*String() sin locale/zona.
 */

export const NZ_LOCALE = 'en-NZ';
export const NZ_TZ = 'Pacific/Auckland';

type DateInput = string | number | Date | null | undefined;

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify(opts);
    let f = cache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(NZ_LOCALE, opts);
        cache.set(key, f);
    }
    return f;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' es un día del calendario NZ: se formatea tal cual (sin moverlo de día) */
function toDate(input: DateInput): { date: Date; calendarDay: boolean } | null {
    if (input === null || input === undefined || input === '') return null;
    if (typeof input === 'string' && YMD.test(input)) return { date: new Date(`${input}T12:00:00Z`), calendarDay: true };
    const date = input instanceof Date ? input : new Date(input);
    return Number.isNaN(date.getTime()) ? null : { date, calendarDay: false };
}

function format(input: DateInput, opts: Intl.DateTimeFormatOptions): string {
    const d = toDate(input);
    if (!d) return '';
    return dtf({ ...opts, timeZone: d.calendarDay ? 'UTC' : NZ_TZ }).format(d.date);
}

/** "07:30" (24 h, hora de NZ) */
export function formatNZTime(input: DateInput): string {
    return format(input, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export type NZDateStyle = 'short' | 'medium' | 'long' | 'weekday' | 'weekdayShort' | 'dayMonth' | 'weekdayDay';
const DATE_STYLES: Record<NZDateStyle, Intl.DateTimeFormatOptions> = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },            // 13/10/2026
    medium: { day: 'numeric', month: 'short', year: 'numeric' },             // 13 Oct 2026
    long: { day: 'numeric', month: 'long', year: 'numeric' },                // 13 October 2026
    weekday: { weekday: 'long', day: 'numeric', month: 'long' },             // Tuesday, 13 October
    weekdayShort: { weekday: 'short', day: 'numeric', month: 'short' },      // Tue, 13 Oct
    dayMonth: { day: 'numeric', month: 'short' },                            // 13 Oct
    weekdayDay: { weekday: 'short', day: 'numeric' },                        // Tue 13
};

/** Fecha en NZ: "13/10/2026" (short) por defecto */
export function formatNZDate(input: DateInput, style: NZDateStyle = 'short'): string {
    return format(input, DATE_STYLES[style]);
}

/** "13/10/2026, 07:30" */
export function formatNZDateTime(input: DateInput): string {
    const d = formatNZDate(input);
    return d ? `${d}, ${formatNZTime(input)}` : '';
}

const numCache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = JSON.stringify(opts);
    let f = numCache.get(key);
    if (!f) {
        f = new Intl.NumberFormat(NZ_LOCALE, opts);
        numCache.set(key, f);
    }
    return f;
}

/** "$1,234.50" (NZD, separadores de NZ) */
export function formatNZD(amount: number, decimals = 2): string {
    if (!Number.isFinite(amount)) return '';
    return nf({ style: 'currency', currency: 'NZD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
}

/** "1,234.5" con separadores de NZ */
export function formatNZNumber(value: number, maxDecimals = 0): string {
    if (!Number.isFinite(value)) return '';
    return nf({ maximumFractionDigits: maxDecimals }).format(value);
}
