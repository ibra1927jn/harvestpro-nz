// Test setup for Vitest
// ── IndexedDB shim (Dexie / offline mode) ────────────
import 'fake-indexeddb/auto';
// ── DOM matchers (toBeInTheDocument, toBeDisabled, etc.) ──
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import type { StateCreator, StoreApi } from 'zustand';
import { registerLocale } from '@/i18n/locales';
import { allTranslations } from '@/i18n/locales/all';

// ── i18n: en la app los idiomas no ingleses se cargan bajo demanda (chunk aparte);
// en los tests se registran todos para poder cambiar de idioma de forma síncrona.
// Los tests del cargador (locales/loader.test.ts) usan un módulo nuevo sin esto.
for (const [locale, dict] of Object.entries(allTranslations) as [keyof typeof allTranslations, Record<string, string>][]) {
    registerLocale(locale, dict);
}

// ── Global safeStorage mock ──────────────────────────
// Prevents Zustand persist middleware from writing to localStorage
// during tests, which would cause cross-test state pollution.
// safeStorage.test.ts uses vi.unmock() to test the real implementation.
vi.mock('@/stores/safeStorage', () => ({
    safeStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
    }
}));

// ── jsdom safety net for pool: forks ─────────────────
// jsdom throws "Not implemented: navigation" for location.reload/assign/replace.
// With pool: 'threads' these are caught, but with 'forks' they kill the worker.
// Mock globally so ALL test files are protected regardless of shard.
if (typeof window !== 'undefined') {
    // Navigation APIs
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: {
            ...originalLocation,
            reload: vi.fn(),
            assign: vi.fn(),
            replace: vi.fn(),
        },
    });

    // matchMedia polyfill (useTheme, useMediaQuery, usePwaInstall, etc.)
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });

    // Suppress jsdom "Not implemented" console errors that don't affect tests
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        const msg = typeof args[0] === 'string' ? args[0] : '';
        if (msg.includes('Not implemented') || msg.includes('Error: Not implemented')) return;
        originalConsoleError.apply(console, args);
    };
}

// ── Timezone lock ────────────────────────────────────
// Force NZ timezone so payroll/nzst calculations match
// production behavior, even when CI runs in UTC.
// Ojo: con pool 'threads' esto no basta (no cambia la zona de Date en el worker);
// la zona real se fija en vitest.config*.ts antes de crear los workers.
process.env.TZ = 'Pacific/Auckland';

// ── Zustand store cleanup ────────────────────────────
// Zustand persists state between tests in the same file, so every store is
// reset to its initial data in afterEach.
// IMPORTANTE: este setup NO debe importar módulos de la app (src/). Todo lo que
// cargue aquí ya está evaluado cuando el test registra sus vi.mock(), y esos mocks
// se ignorarían en silencio (lo vigila `npm run test:mock-guard`).
// Por eso no se importa useHarvestStore: se envuelve `create` de zustand y cada
// store se registra al crearse, cuando el test (y sus mocks) ya lo importa.
const { storeResets } = vi.hoisted(() => ({ storeResets: new Set<() => void>() }));

vi.mock('zustand', async (importOriginal) => {
    const actual = await importOriginal<typeof import('zustand')>();
    const track = <S extends StoreApi<unknown>>(store: S): S => {
        // Solo datos (sin funciones), serializado para no compartir referencias
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(store.getState() as object)) {
            if (typeof v !== 'function') data[k] = v;
        }
        const initialDataStr = JSON.stringify(data);
        storeResets.add(() => store.setState(JSON.parse(initialDataStr) as unknown, false));
        return store;
    };
    const create = ((initializer?: StateCreator<unknown>) =>
        initializer
            ? track(actual.create(initializer))
            : (init: StateCreator<unknown>) => track(actual.create(init))) as unknown as typeof actual.create;
    return { ...actual, create };
});

afterEach(() => {
    // Reset Zustand stores to clean initial state
    for (const reset of storeResets) reset();
    // Clear localStorage to prevent cross-test pollution
    // Defensive: some tests stub localStorage without clear()
    if (typeof window !== 'undefined' && typeof localStorage?.clear === 'function') {
        localStorage.clear();
    }
});
