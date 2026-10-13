/**
 * Textos que oye el runner con TalkBack al guardar cubetas: a quién se le
 * apuntó y si quedó en el móvil por falta de cobertura. En el idioma de la app.
 */
import { translate, type TFunction } from '@/i18n';

export function bucketSavedAnnouncement(pickerNames: string[], online: boolean, t: TFunction = translate): string {
  const names = pickerNames.filter(Boolean);
  const count = names.length;
  if (count === 0) return '';
  const unique = [...new Set(names)];
  const who = unique.length > 3
    ? t('runner.sr.names_and_more', { names: unique.slice(0, 3).join(', '), n: unique.length - 3 })
    : unique.join(', ');
  const base = count === 1 ? t('runner.sr.saved_one', { who }) : t('runner.sr.saved_other', { n: count, who });
  return online ? `${base}.` : `${base}. ${t('runner.sr.saved_offline')}`;
}

/** navigator.onLine sin romper en entornos sin navigator */
export function isOnlineNow(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
