export interface HardcodedFinding { file: string; line: number; kind: string; text: string }
export interface Allowlist { exact: Set<string>; words: string[]; ignoreFiles: string[] }
export interface CheckResult {
    languages: string[];
    keyCount: Record<string, number>;
    spreads: Record<string, number>;
    missing: Record<string, string[]>;
    extra: Record<string, string[]>;
    placeholderMismatch: { lang: string; key: string; expected: string; actual: string }[];
    empty: { lang: string; key: string }[];
    unknownKeys: { key: string; missingIn: string[]; where: string[] }[];
    badDynamic: { prefix: string; file: string; line: number }[];
    hardcoded: HardcodedFinding[];
    perFile: Record<string, number>;
    regressions: { file: string; count: number; allowed: number }[];
    unusedEnKeys: string[];
}
export const ROOT: string;
export const BASELINE_FILE: string;
export const ALLOWLIST_FILE: string;
export function extractDictFromSource(text: string, file?: string): { dict: Record<string, string>; nonLiteral: string[]; spreads: number };
export function loadLocales(dir?: string): { locales: Record<string, Record<string, string>>; spreads: Record<string, number> };
export function placeholders(value: string): string[];
export function compareLocales(locales: Record<string, Record<string, string>>, base?: string): Pick<CheckResult, 'missing' | 'extra' | 'placeholderMismatch' | 'empty'>;
export function extractUsedKeys(text: string, file?: string): { keys: { key: string; line: number }[]; dynamic: { prefix: string; line: number }[] };
export function isUserText(raw: string, allow: Allowlist): boolean;
export function loadAllowlist(file?: string): Allowlist;
export function findHardcoded(text: string, file: string, allow: Allowlist): HardcodedFinding[];
export function sourceFiles(root?: string): string[];
export function runChecks(opts?: { root?: string; allow?: Allowlist; baseline?: Record<string, number> }): CheckResult;
export function failures(r: CheckResult): string[];
