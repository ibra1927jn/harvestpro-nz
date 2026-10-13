import { describe, it, expect } from 'vitest';
import { bucketSavedAnnouncement } from './runnerAnnouncements';

describe('bucketSavedAnnouncement', () => {
  it('names the picker when online', () => {
    expect(bucketSavedAnnouncement(['Ana Tui'], true)).toBe('Bucket saved for Ana Tui.');
  });

  it('says it was saved offline when there is no signal', () => {
    const msg = bucketSavedAnnouncement(['Ana Tui'], false);
    expect(msg).toMatch(/^Bucket saved for Ana Tui\. No signal, saved offline\./);
  });

  it('counts buckets and lists each picker once', () => {
    expect(bucketSavedAnnouncement(['Ana', 'Ben', 'Ana'], true)).toBe('3 buckets saved for Ana, Ben.');
  });

  it('shortens long lists', () => {
    expect(bucketSavedAnnouncement(['A', 'B', 'C', 'D', 'E'], true)).toBe(
      '5 buckets saved for A, B, C and 2 more.'
    );
  });

  it('returns nothing when no bucket was saved', () => {
    expect(bucketSavedAnnouncement([], true)).toBe('');
  });
});

describe('bucketSavedAnnouncement in the app language', () => {
  it('speaks Spanish when the app is in Spanish (TalkBack reads it with the Spanish voice)', async () => {
    const { setCurrentLocale } = await import('@/i18n');
    setCurrentLocale('es');
    try {
      expect(bucketSavedAnnouncement(['Ana Tui'], true)).toBe('Cubeta guardada para Ana Tui.');
      expect(bucketSavedAnnouncement(['A', 'B'], false)).toBe(
        '2 cubetas guardadas para A, B. Sin señal, guardado en el móvil. Se enviará cuando vuelva la conexión.'
      );
    } finally {
      setCurrentLocale('en');
    }
  });
});
