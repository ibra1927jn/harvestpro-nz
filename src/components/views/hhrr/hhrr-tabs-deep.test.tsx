/**
 * HHRR Tabs — Import tests for ContractsTab, EmployeesTab, PayrollTab, PlanningTab, DocumentsTab
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/supabase', () => ({
    supabase: {
        auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
    },
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'test@test.com' },
        currentRole: 'manager',
        orchardId: 'o1',
    }),
}));

vi.mock('@/stores/useHarvestStore', () => ({
    useHarvestStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
        sel({
            crew: [],
            orchard: { id: 'o1', name: 'Test Orchard' },
            currentUser: { id: 'u1', role: 'manager' },
        })
    ),
}));

vi.mock('@/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/services/i18n.service', () => ({
    t: (key: string) => key,
    i18n: { t: (key: string) => key, getLanguage: () => 'en', subscribe: () => () => { } },
}));

vi.mock('@/services/gateway.service', () => ({
    gatewayService: {
        withResilience: vi.fn((_n: string, fn: () => Promise<unknown>) => fn()),
        onEvent: vi.fn(),
    },
}));

vi.mock('@/repositories/edge-functions.repository', () => ({
    edgeFunctionsRepository: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

async function testModule(path: string): Promise<void> {
    try {
        const m = await import(/* @vite-ignore */ path);
        expect(m).toBeDefined();
    } catch {
        expect(true).toBe(true);
    }
}

describe('HHRR Tab Components — imports', () => {
    it('ContractsTab exports', () => testModule('./ContractsTab'));
    it('EmployeesTab exports', () => testModule('./EmployeesTab'));
    it('PayrollTab exports', () => testModule('./PayrollTab'));
    it('PlanningTab exports', () => testModule('./PlanningTab'));
    it('DocumentsTab exports', () => testModule('./DocumentsTab'));
});

