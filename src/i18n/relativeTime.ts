/** "hace 5 min" / "5m ago"… en el idioma de la app; más de 7 días → fecha NZ (dd/mm/aaaa) */
import type { TFunction } from './index';
import { formatNZDate } from '@/utils/nzFormat';

export function relativeTime(t: TFunction, input: string | number | Date, now: number = Date.now()): string {
    const date = input instanceof Date ? input : new Date(input);
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('time.just_now');
    if (minutes < 60) return t('time.minutes_ago', { n: minutes });
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return t('time.hours_ago', { n: hours });
    const days = Math.floor(diff / 86400000);
    if (days < 7) return t('time.days_ago', { n: days });
    return formatNZDate(date);
}
