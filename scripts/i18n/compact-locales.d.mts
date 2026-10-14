import type { Plugin } from 'vite';
export const LOCALES: readonly string[];
export function evaluateLocale(localesDir: string, lang: string): Record<string, string>;
export function compactLocaleSource(
  lang: string,
  dict: Record<string, string>,
  enKeys: string[],
  enModuleId: string,
): string;
export function compactLocalesPlugin(): Plugin;
