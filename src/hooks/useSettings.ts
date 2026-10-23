/**
 * useSettings — State management and handlers for SettingsView
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { settingsService } from '@/services/settings.service';
import { notificationService } from '@/services/notification.service';
import { logger } from '@/utils/logger';
import { PAY_RULES } from '@/services/harvestMetrics/pay';

/** Roles que pueden editar el salario mínimo (valor regulado por ley NZ) */
const WAGE_EDIT_ROLES = new Set(['admin', 'hr_admin']);

export interface SettingsFormData {
    /**
     * Precio general de HOY (solo lectura en el formulario: se cambia en
     * «Precio por cubeta — hoy», que escribe piece_rates). Sirve para el
     * objetivo mínimo de cubetas/hora.
     */
    piece_rate: number;
    min_wage_rate: number;
    min_buckets_per_hour: number;
    target_tons: number;
    /** Variedad guardada (no se edita aquí ni se escribe al guardar: fallo B5) */
    variety: string;
    /**
     * Hora prevista de inicio de turno (HH:MM, 24h). No hay hora de fin: cada
     * equipo y runner termina cuando ficha su salida (decisión del dueño 2026-10-21).
     */
    shift_start_time: string;
}

/** Variedades distintas de las filas del huerto (block_rows), en orden alfabético */
export function varietiesOfRows(blocks: ReadonlyArray<{ rowVarieties: Record<number, string> }>): string[] {
    const names = new Set<string>();
    for (const b of blocks) {
        for (const v of Object.values(b.rowVarieties)) {
            const name = (v ?? '').trim();
            if (name && name !== 'Desconocida') names.add(name);
        }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

export function useSettings() {
    const { orchard, settings, currentUser } = useHarvestStore();
    const orchardBlocks = useHarvestStore(s => s.orchardBlocks);
    const orchardId = orchard?.id;

    // Form data
    const [formData, setFormData] = useState<SettingsFormData>({
        piece_rate: settings?.piece_rate ?? 6.5,
        min_wage_rate: settings?.min_wage_rate ?? PAY_RULES.minWageFloor,
        min_buckets_per_hour: settings?.min_buckets_per_hour ?? 8,
        target_tons: settings?.target_tons ?? 40,
        variety: settings?.variety ?? '',
        shift_start_time: settings?.shift_start_time ?? '07:00',
    });

    // Variedades del huerto: las de sus filas (block_rows). El selector de
    // huerto de Ajustes se quitó (B5): el cambio de huerto es el OrchardSwitcher
    // de la cabecera, y guardar con otro huerto elegido chocaba con la RLS.
    const orchardVarieties = useMemo(() => {
        const fromRows = varietiesOfRows(orchardBlocks);
        return fromRows.length > 0 ? fromRows.join(', ') : '—';
    }, [orchardBlocks]);

    // Notification state
    const [notifEnabled, setNotifEnabled] = useState(() => notificationService.getPrefs().enabled);
    const [notifTypes, setNotifTypes] = useState(() => notificationService.getPrefs().types);
    const [notifTestSent, setNotifTestSent] = useState(false);

    // Save state
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // Permiso de edición del salario mínimo: sólo admin y hr_admin
    const canEditMinWage = WAGE_EDIT_ROLES.has(currentUser?.role ?? '');

    // Floor de compliance: ceil(minWage / pieceRate)
    // Un picker necesita al menos este número de baldes/hora para no caer bajo el salario mínimo
    const complianceFloor = useMemo(() => {
        const rate = Number(formData.piece_rate);
        const wage = Number(formData.min_wage_rate);
        if (!rate || rate <= 0) return 1;
        return Math.ceil(wage / rate);
    }, [formData.piece_rate, formData.min_wage_rate]);

    // Sync from store
    useEffect(() => {
        if (settings) {
            setFormData({
                piece_rate: settings.piece_rate,
                min_wage_rate: settings.min_wage_rate,
                min_buckets_per_hour: Math.max(settings.min_buckets_per_hour, Math.ceil(settings.min_wage_rate / settings.piece_rate)),
                target_tons: settings.target_tons,
                variety: settings.variety ?? '',
                shift_start_time: settings.shift_start_time ?? '07:00',
            });
        }
    }, [settings]);

    // Auto-sync min_buckets_per_hour al floor de compliance cuando cambia piece_rate o min_wage_rate.
    // Si el valor actual ya es mayor al nuevo floor (override manual), se respeta.
    // Si es menor o igual al floor anterior, se actualiza para reflejar el nuevo mínimo legal.
    useEffect(() => {
        setFormData(prev => {
            if (prev.min_buckets_per_hour <= complianceFloor) {
                return { ...prev, min_buckets_per_hour: complianceFloor };
            }
            return prev;
        });
    }, [complianceFloor]);

    const handleChange = useCallback((field: keyof SettingsFormData, value: string | number) => {
        setFormData(prev => {
            const next = { ...prev, [field]: value };

            // Cuando cambia piece_rate o min_wage_rate, recalcular el floor y
            // actualizar min_buckets_per_hour si estaba en el floor anterior (no era override manual)
            if (field === 'piece_rate' || field === 'min_wage_rate') {
                const oldFloor = Number(prev.piece_rate) > 0
                    ? Math.ceil(Number(prev.min_wage_rate) / Number(prev.piece_rate))
                    : 1;
                const newRate = field === 'piece_rate' ? Number(value) : Number(prev.piece_rate);
                const newWage = field === 'min_wage_rate' ? Number(value) : Number(prev.min_wage_rate);
                const newFloor = newRate > 0 ? Math.ceil(newWage / newRate) : 1;
                if (prev.min_buckets_per_hour <= oldFloor) {
                    next.min_buckets_per_hour = newFloor;
                }
            }

            // Asegurar que min_buckets_per_hour nunca baje del floor de compliance
            if (field === 'min_buckets_per_hour') {
                const floor = Math.ceil(Number(next.min_wage_rate) / Number(next.piece_rate));
                next.min_buckets_per_hour = Math.max(Number(value), floor);
            }
            return next;
        });
        setHasChanges(true);
        setSaveStatus('idle');
    }, []);

    /**
     * Precio general de hoy (lo avisa el editor de precios al cargar o guardar).
     * Ya está guardado: no marca cambios pendientes; sí recalcula el objetivo
     * mínimo de cubetas/hora si estaba en el mínimo legal.
     */
    const setGeneralRate = useCallback((rate: number) => {
        setFormData(prev => {
            if (Number(prev.piece_rate) === rate) return prev;
            const oldFloor = Number(prev.piece_rate) > 0 ? Math.ceil(Number(prev.min_wage_rate) / Number(prev.piece_rate)) : 1;
            const newFloor = rate > 0 ? Math.ceil(Number(prev.min_wage_rate) / rate) : 1;
            return {
                ...prev,
                piece_rate: rate,
                min_buckets_per_hour: prev.min_buckets_per_hour <= oldFloor ? newFloor : prev.min_buckets_per_hour,
            };
        });
    }, []);

    const handleSave = async () => {
        if (!orchardId) return;
        setIsSaving(true);
        setSaveStatus('idle');
        setSaveError(null);
        try {
            // Sin piece_rate (el precio de hoy se guarda en «Precio por cubeta — hoy»,
            // tabla piece_rates) y sin variety: antes escribía «Cherry» por defecto
            // en huertos de manzanas (auditoría 23-10, B5)
            const payload = {
                min_wage_rate: Number(formData.min_wage_rate),
                min_buckets_per_hour: Number(formData.min_buckets_per_hour),
                target_tons: Number(formData.target_tons),
                shift_start_time: formData.shift_start_time,
            };
            const result = await settingsService.updateHarvestSettings(orchardId, payload);
            if (!result.ok) {
                // Antes salía "guardado" aunque la BD lo rechazara
                setSaveError(result.reason);
                setSaveStatus('error');
                return;
            }
            // Ya está guardado: solo actualizar la pantalla (sin volver a escribir)
            useHarvestStore.setState(state => ({ settings: { ...state.settings, ...payload } }));
            setSaveStatus('saved');
            setHasChanges(false);
        } catch (e) {
            logger.error('[SettingsView] Failed to save settings:', e);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleNotifToggle = async (enabled: boolean) => {
        const ok = await notificationService.setEnabled(enabled);
        if (ok) setNotifEnabled(enabled);
    };

    const handleNotifType = (type: string, checked: boolean) => {
        const updated = { ...notifTypes, [type]: checked };
        setNotifTypes(updated);
        notificationService.setAlertTypes({ [type]: checked } as Record<string, boolean>);
    };

    const handleSendTest = () => {
        notificationService.sendTest();
        setNotifTestSent(true);
        setTimeout(() => setNotifTestSent(false), 3000);
    };

    const initials = (currentUser?.name || 'M')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return {
        // Context
        orchard, currentUser, initials,
        // Form
        formData, handleChange, setGeneralRate,
        // Permissions & compliance floor
        canEditMinWage,
        complianceFloor,
        // Orchard details
        orchardVarieties,
        // Save
        isSaving, saveStatus, saveError, hasChanges, handleSave,
        // Notifications
        notifEnabled, notifTypes, notifTestSent,
        handleNotifToggle, handleNotifType, handleSendTest,
    };
}
