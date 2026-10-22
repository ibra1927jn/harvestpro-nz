/**
 * useHHRR — Data loading for the HHRR page
 *
 * Extracts data fetching logic from HHRR.tsx following
 * the usePayroll pattern (thin hook, page becomes pure orchestrator).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    loadHRDashboard,
    type HRSummary, type Employee, type PayrollEntry, type ComplianceAlert
} from '@/services/hhrr.service';
import { logger } from '@/utils/logger';

export interface UseHHRRResult {
    summary: HRSummary;
    employees: Employee[];
    payroll: PayrollEntry[];
    alerts: ComplianceAlert[];
    isLoading: boolean;
    reload: () => Promise<void>;
}

export function useHHRR(): UseHHRRResult {
    const [summary, setSummary] = useState<HRSummary>({
        activeWorkers: 0, pendingContracts: 0, payrollThisWeek: 0, complianceAlerts: 0,
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
    const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Solo la primera carga muestra el esqueleto; al recargar tras un cambio
    // la pantalla se queda (si no, se perdía el aviso de "guardado")
    const loadedOnce = useRef(false);
    const reload = useCallback(async () => {
        if (!loadedOnce.current) setIsLoading(true);
        try {
            const { summary: sum, employees: emps, payroll: pay, alerts: alts } = await loadHRDashboard();
            setSummary(sum);
            setEmployees(emps);
            setPayroll(pay);
            setAlerts(alts);
        } catch (err) {
            logger.warn('[HHRR] Failed to load HR data:', err);
        } finally {
            setIsLoading(false);
            loadedOnce.current = true;
        }
    }, []);

    useEffect(() => {
        reload();
    }, [reload]);

    return { summary, employees, payroll, alerts, isLoading, reload };
}
