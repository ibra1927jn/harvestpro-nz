/**
 * Tests for i18n/index.ts — internationalization provider and helpers
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SUPPORTED_LOCALES, I18nProvider, useI18n } from './index';

describe('SUPPORTED_LOCALES', () => {
  it('has 3 locales (en, es, fr)', () => {
    expect(SUPPORTED_LOCALES.map(l => l.code)).toEqual(['en', 'es', 'fr']);
  });

  it('default is English', () => {
    expect(SUPPORTED_LOCALES[0].code).toBe('en');
    expect(SUPPORTED_LOCALES[0].label).toBe('English');
  });

  it('includes Spanish', () => {
    const es = SUPPORTED_LOCALES.find(l => l.code === 'es');
    expect(es).toBeDefined();
    expect(es!.nativeName).toBe('Español');
  });

  it('each locale has required fields', () => {
    SUPPORTED_LOCALES.forEach(locale => {
      expect(locale).toHaveProperty('code');
      expect(locale).toHaveProperty('label');
      expect(locale).toHaveProperty('nativeName');
      expect(locale).toHaveProperty('flag');
    });
  });
});

describe('I18nProvider', () => {
  it('renders children', () => {
    render(
      React.createElement(
        I18nProvider,
        null,
        React.createElement('div', { 'data-testid': 'child' }, 'Hello')
      )
    );
    expect(screen.getByTestId('child')).toBeDefined();
  });

  it('keeps <html lang> in sync with the selected locale', async () => {
    document.documentElement.lang = 'en';
    function Switcher() {
      const { setLocale } = useI18n();
      return React.createElement('button', { onClick: () => setLocale('es') }, 'es');
    }
    render(React.createElement(I18nProvider, null, React.createElement(Switcher)));
    fireEvent.click(screen.getByRole('button', { name: 'es' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('es'));
    localStorage.removeItem('harvestpro_locale');
  });
});

describe('useI18n', () => {
  it('is a function', () => {
    expect(typeof useI18n).toBe('function');
  });
});
