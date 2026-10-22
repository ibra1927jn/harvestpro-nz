/**
 * analytics-trends.service — tendencia diaria de coste por cubeta.
 *
 * El gráfico «Costo por cubeta — tendencia 7 días» estuvo vacío desde que existe
 * (devolvía costPerBin: []). Ahora cada punto es el pago del día (cubetas +
 * complemento al mínimo, el mismo cálculo que la nómina) entre las cubetas del día.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsTrendsRepository } from '@/repositories/analytics-trends.repository';
import { AnalyticsTrendsService, nzDateRange } from './analytics-trends.service';
import { minWageFloorOn } from '@/services/harvestMetrics/pay';

vi.mock('@/repositories/analytics-trends.repository', () => ({
    analyticsTrendsRepository: {
        getDailyAggregates: vi.fn(),
        getPayInputs: vi.fn(),
    },
}));

// Precios por día (piece_rates): por defecto ninguno (se paga a piece_rate)
const loadRange = vi.fn();
vi.mock('@/repositories/piece-rates.repository', () => ({
    pieceRatesRepository: { loadRange: (...a: unknown[]) => loadRange(...a) },
}));

const repo = vi.mocked(analyticsTrendsRepository);

/** Cubetas de un picker repartidas en una hora NZ (UTC+13 en octubre) */
function buckets(pickerId: string, dateNZ: string, n: number) {
    return Array.from({ length: n }, (_, i) => ({
        picker_id: pickerId,
        orchard_id: 'o1',
        variety: null,
        scanned_at: `${dateNZ}T${String(8 + Math.floor(i / 10)).padStart(2, '0')}:${String((i % 10) * 5).padStart(2, '0')}:00+13:00`,
        quality_grade: null,
    }));
}

/** Tramo cerrado 07:00–15:00 NZ (8 h pagables) sin descanso apuntado */
function shift(pickerId: string, dateNZ: string) {
    return {
        picker_id: pickerId, orchard_id: 'o1', date: dateNZ,
        check_in: `${dateNZ}T07:00:00+13:00`, check_out: `${dateNZ}T15:00:00+13:00`,
        break_start: null, break_minutes: 0,
    };
}

const settings = { piece_rate: 6.5, min_wage_rate: 23.95 };

describe('nzDateRange', () => {
    it('lista los días del rango, ambos incluidos', () => {
        expect(nzDateRange('2026-10-10', '2026-10-12')).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
        expect(nzDateRange('2026-10-12', '2026-10-10')).toEqual([]);
        expect(nzDateRange('no', '2026-10-10')).toEqual([]);
    });
});

describe('getDailyTrendsV2 — costPerBin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        loadRange.mockResolvedValue([]);
        repo.getDailyAggregates.mockResolvedValue([
            { date: '2026-10-10', total_buckets: 50, workforce_count: 1 },
            { date: '2026-10-11', total_buckets: 10, workforce_count: 1 },
        ]);
    });

    it('sin ajustes de pago sigue devolviendo costPerBin vacío y no pide fichajes', async () => {
        const svc = new AnalyticsTrendsService();
        const out = await svc.getDailyTrendsV2('o1', '2026-10-10', '2026-10-12', 6.5);
        expect(out.costPerBin).toEqual([]);
        expect(out.totalBins).toHaveLength(2);
        expect(repo.getPayInputs).not.toHaveBeenCalled();
    });

    it('un punto por día con cubetas: pago del día / cubetas, con complemento al mínimo', async () => {
        repo.getPayInputs.mockResolvedValue({
            attendance: [shift('p1', '2026-10-10'), shift('p1', '2026-10-11')],
            buckets: [...buckets('p1', '2026-10-10', 50), ...buckets('p1', '2026-10-11', 10)],
        });
        const svc = new AnalyticsTrendsService();
        const out = await svc.getDailyTrendsV2('o1', '2026-10-10', '2026-10-12', 6.5, settings);

        expect(repo.getPayInputs).toHaveBeenCalledWith('o1', '2026-10-10', '2026-10-12');
        // El 12 no tiene cubetas: no hay punto (el gráfico no pinta un 0 engañoso)
        expect(out.costPerBin.map(p => p.label)).toEqual(['2026-10-10', '2026-10-11']);

        // Día 10: 50 × 6.50 = 325 > 8 h × mínimo → se paga la pieza, 6.50/cubeta
        const d10 = out.costPerBin[0];
        expect(d10.value).toBe(6.5);
        expect(d10.meta).toMatchObject({ date: '2026-10-10', totalBuckets: 50, costPerBin: 6.5, topUpCost: 0 });

        // Día 11: 10 × 6.50 = 65 < 8 h × mínimo → se paga el mínimo del día
        const minWage = Math.max(23.95, minWageFloorOn('2026-10-11'));
        const total = 8 * minWage;
        const d11 = out.costPerBin[1];
        expect(d11.value).toBeCloseTo(total / 10, 2);
        expect(d11.meta?.topUpCost).toBeCloseTo(total - 65, 2);
    });
});

describe('getDailyBleed', () => {
    beforeEach(() => vi.clearAllMocks());

    it('usa el mismo cálculo diario (complemento del día redondeado)', async () => {
        repo.getPayInputs.mockResolvedValue({
            attendance: [],
            buckets: [],
        });
        const svc = new AnalyticsTrendsService();
        const out = await svc.getDailyBleed('o1', 3, 'en-NZ', settings);
        expect(out).toHaveLength(3);
        expect(out[2].label).toBe('Today');
        expect(out.every(p => p.value === 0)).toBe(true);
        expect(repo.getPayInputs).toHaveBeenCalledTimes(1);
    });
});

// Auditoría 23-10 (A4): cambiar el precio hoy no reescribe la tendencia de días pasados
describe('getDailyPay — precio de cada día (piece_rates)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        repo.getPayInputs.mockResolvedValue({
            attendance: [],
            buckets: [...buckets('p1', '2026-10-10', 10), ...buckets('p1', '2026-10-11', 10)],
        });
    });

    it('cada día cobra el precio fijado ese día o antes; los días anteriores conservan el suyo', async () => {
        loadRange.mockResolvedValue([
            { orchardId: 'o1', variety: null, effectiveDate: '2026-10-01', pieceRate: 6.5 },
            { orchardId: 'o1', variety: null, effectiveDate: '2026-10-11', pieceRate: 8 },
        ]);
        const pay = await new AnalyticsTrendsService().getDailyPay('o1', '2026-10-10', '2026-10-11', { piece_rate: 8, min_wage_rate: 23.95 });
        expect(loadRange).toHaveBeenCalledWith('2026-10-10', '2026-10-11', 'o1');
        expect(pay.get('2026-10-10')?.pieceEarnings).toBe(65);
        expect(pay.get('2026-10-11')?.pieceEarnings).toBe(80);
    });

    it('con los precios ya cargados no los vuelve a pedir; sin poder leerlos, piece_rate', async () => {
        const svc = new AnalyticsTrendsService();
        const pay = await svc.getDailyPay('o1', '2026-10-10', '2026-10-11', {
            piece_rate: 6.5, min_wage_rate: 23.95,
            daily_rates: [{ orchardId: 'o1', variety: null, effectiveDate: '2026-10-11', pieceRate: 7 }],
        });
        expect(loadRange).not.toHaveBeenCalled();
        expect([pay.get('2026-10-10')?.pieceEarnings, pay.get('2026-10-11')?.pieceEarnings]).toEqual([65, 70]);

        loadRange.mockRejectedValue(new Error('offline'));
        const fallback = await svc.getDailyPay('o1', '2026-10-10', '2026-10-11', { piece_rate: 6.5, min_wage_rate: 23.95 });
        expect(fallback.get('2026-10-11')?.pieceEarnings).toBe(65);
    });
});
