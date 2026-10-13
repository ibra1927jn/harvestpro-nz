/**
 * usePayroll — Datos de la pantalla de Nómina, por SEMANA DE PAGO.
 *
 * La nómina es semanal (lunes–domingo, hora NZ) y se cierra el lunes siguiente,
 * así que la pantalla trabaja con una semana completa, no con el día de hoy.
 * Cálculo: Edge Function calculate-payroll (pay-rules.ts, mismo código que la app).
 */
import { useState, useEffect, useCallback } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { payrollService, PayrollResult } from '@/services/payroll.service';
import { payWeekOf, type PayWeek } from '@/services/harvestMetrics';
import { todayNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { useAuth } from '@/context/AuthContext';
import type { PayWeekActionResult } from '@/repositories/payroll.repository';
import { translate } from '@/i18n';

/** Semana de pago a mostrar por defecto: el lunes se cierra la semana anterior. */
export function defaultPayWeek(today: string = todayNZST()): PayWeek {
    const current = payWeekOf(today);
    if (current.start !== today) return current;
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return payWeekOf(yesterday.toISOString().slice(0, 10));
}

/** Semana anterior o siguiente */
export function shiftPayWeek(week: PayWeek, weeks: number): PayWeek {
    const d = new Date(`${week.start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return payWeekOf(d.toISOString().slice(0, 10));
}

export function usePayroll() {
    const orchardId = useHarvestStore((s) => s.orchard?.id);
    const [week, setWeek] = useState<PayWeek>(() => defaultPayWeek());
    const [payrollData, setPayrollData] = useState<PayrollResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Solo la primera carga muestra el esqueleto; al cambiar de semana se mantiene la pantalla
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [closing, setClosing] = useState(false);
    const [closeResult, setCloseResult] = useState<PayWeekActionResult | null>(null);
    const { appUser } = useAuth();

    useEffect(() => {
        let cancelled = false;
        const loadPayroll = async () => {
            if (!orchardId) { setIsLoading(false); return; }
            try {
                setIsLoading(true);
                setError(null);
                // Nómina de la EMPRESA: cada persona suma lo trabajado en todos los
                // huertos esa semana (hoy en A, mañana en B...)
                const data = await payrollService.calculatePayroll(undefined, week.start, week.end);
                if (!cancelled) setPayrollData(data);
            } catch (err) {
                logger.warn('[Payroll] Failed to load payroll data:', err);
                if (!cancelled) {
                    setPayrollData(null);
                    setError(translate('pay.err.calc'));
                }
            } finally {
                if (!cancelled) { setIsLoading(false); setHasLoadedOnce(true); }
            }
        };
        loadPayroll();
        return () => { cancelled = true; };
    }, [orchardId, week, reloadKey]);

    // Al cambiar de semana se olvida el aviso de la anterior
    useEffect(() => { setCloseResult(null); }, [week]);

    const goToWeek = useCallback((weeks: number) => setWeek(w => shiftPayWeek(w, weeks)), []);

    // Cierre de semana: solo Nómina y admin, y solo semanas ya terminadas
    const canManageWeek = appUser?.role === 'payroll_admin' || appUser?.role === 'admin';
    const weekFinished = todayNZST() > week.end;
    const closedInfo = payrollData?.closed ?? null;

    const closeWeek = useCallback(async () => {
        setClosing(true);
        setError(null);
        try {
            const res = await payrollService.closePayWeek(week.start);
            setCloseResult(res);
            if (res.closed || res.already_closed) setReloadKey(k => k + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : translate('pay.err.close'));
        } finally {
            setClosing(false);
        }
    }, [week.start]);

    const reopenWeek = useCallback(async (reason: string) => {
        setClosing(true);
        setError(null);
        try {
            await payrollService.reopenPayWeek(week.start, reason);
            setCloseResult(null);
            setReloadKey(k => k + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : translate('pay.err.reopen'));
        } finally {
            setClosing(false);
        }
    }, [week.start]);

    const summary = payrollData?.summary || { total_buckets: 0, total_hours: 0, total_piece_rate_earnings: 0, total_top_up: 0, total_earnings: 0 };
    const compliance = payrollData?.compliance || { workers_below_minimum: 0, workers_total: 0, compliance_rate: 100 };
    const pickers = payrollData?.picker_breakdown || [];
    const settings = payrollData?.settings || { bucket_rate: 0, min_wage_rate: 23.95 };

    return {
        orchardId, isLoading, hasLoadedOnce, error, week, goToWeek, summary, compliance, pickers, settings,
        closedInfo, canManageWeek, weekFinished, closing, closeResult, closeWeek, reopenWeek,
    };
}
