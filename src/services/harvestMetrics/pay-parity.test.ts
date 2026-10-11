/**
 * El servidor (Edge Functions, Deno) usa una copia literal de pay.ts en
 * supabase/functions/_shared/pay-rules.ts. Si alguien cambia una sin la otra,
 * la app y la nómina volverían a dar cifras distintas: este test lo impide.
 *
 * Para actualizar: cp src/services/harvestMetrics/pay.ts supabase/functions/_shared/pay-rules.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('pay rules parity (app ↔ Edge Functions)', () => {
    it('supabase/functions/_shared/pay-rules.ts es idéntico a pay.ts', () => {
        const root = resolve(__dirname, '../../..');
        const app = readFileSync(resolve(root, 'src/services/harvestMetrics/pay.ts'), 'utf8');
        const edge = readFileSync(resolve(root, 'supabase/functions/_shared/pay-rules.ts'), 'utf8');
        expect(edge).toBe(app);
    });

    it('pay.ts no importa nada (debe funcionar igual en Deno)', () => {
        const root = resolve(__dirname, '../../..');
        const app = readFileSync(resolve(root, 'src/services/harvestMetrics/pay.ts'), 'utf8');
        expect(app).not.toMatch(/^\s*import\s/m);
    });

    it('supabase/functions/_shared/fetch-all-rows.ts es idéntico a src/utils/fetchAllRows.ts', () => {
        const root = resolve(__dirname, '../../..');
        const app = readFileSync(resolve(root, 'src/utils/fetchAllRows.ts'), 'utf8');
        const edge = readFileSync(resolve(root, 'supabase/functions/_shared/fetch-all-rows.ts'), 'utf8');
        expect(edge).toBe(app);
    });

    it('la lista de festivos de pay.ts coincide con src/constants/nz-law.ts', async () => {
        const { NZ_PUBLIC_HOLIDAYS } = await import('./pay');
        const law = await import('@/constants/nz-law');
        expect([...NZ_PUBLIC_HOLIDAYS].sort()).toEqual([...law.NZ_PUBLIC_HOLIDAYS].sort());
    });
});
