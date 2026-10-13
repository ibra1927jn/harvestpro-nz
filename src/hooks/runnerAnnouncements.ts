/**
 * Textos que oye el runner con TalkBack al guardar cubetas: a quién se le
 * apuntó y si quedó en el móvil por falta de cobertura.
 */
export function bucketSavedAnnouncement(pickerNames: string[], online: boolean): string {
  const names = pickerNames.filter(Boolean);
  const count = names.length;
  if (count === 0) return '';
  const unique = [...new Set(names)];
  const who = unique.length > 3 ? `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} more` : unique.join(', ');
  const base = count === 1 ? `Bucket saved for ${who}` : `${count} buckets saved for ${who}`;
  return online ? `${base}.` : `${base}. No signal, saved offline. It will sync when you are back online.`;
}

/** navigator.onLine sin romper en entornos sin navigator */
export function isOnlineNow(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
