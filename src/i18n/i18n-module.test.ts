/**
 * Tests for i18n module — translation system (402 lines)
 */
import { describe, it, expect } from 'vitest';

import { SUPPORTED_LOCALES } from './index';

describe('i18n module', () => {
  describe('SUPPORTED_LOCALES', () => {
    it('supports English', () => {
      const en = SUPPORTED_LOCALES.find(l => l.code === 'en');
      expect(en).toBeDefined();
      expect(en!.label).toBe('English');
    });

    it('supports Spanish', () => {
      const es = SUPPORTED_LOCALES.find(l => l.code === 'es');
      expect(es).toBeDefined();
      expect(es!.nativeName).toBe('Español');
    });

    it('has exactly 2 locales', () => {
      expect(SUPPORTED_LOCALES.map(l => l.code)).toEqual(['en', 'es']);
    });

    it('all locales have required fields', () => {
      SUPPORTED_LOCALES.forEach(locale => {
        expect(locale.code).toBeDefined();
        expect(locale.label).toBeDefined();
        expect(locale.nativeName).toBeDefined();
        expect(locale.flag).toBeDefined();
      });
    });
  });
});

describe('interpolate / translate', () => {
  it('replaces every {placeholder} it is given and leaves the others', async () => {
    const { interpolate } = await import('./index');
    expect(interpolate('{n} of {total} — {n}', { n: 3, total: 10 })).toBe('3 of 10 — 3');
    expect(interpolate('Row {row}', {})).toBe('Row {row}');
    expect(interpolate('$5', undefined)).toBe('$5');
  });

  it('translate() outside React follows the current app language, falling back to English', async () => {
    const { translate, setCurrentLocale } = await import('./index');
    const { translations } = await import('./locales/all');
    setCurrentLocale('es');
    try {
      expect(translate('common.retry')).toBe(translations.es['common.retry']);
      expect(translate('assignModal.title', { row: 7 })).toBe(translations.es['assignModal.title'].replace('{row}', '7'));
      expect(translate('assignModal.title', { row: 7 })).not.toContain('{row}');
      expect(translate('no.such.key')).toBe('no.such.key');
    } finally {
      setCurrentLocale('en');
    }
    expect(translate('common.retry')).toBe('Retry');
  });
});
