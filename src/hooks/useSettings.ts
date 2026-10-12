/**
 * useSettings — State management and handlers for SettingsView
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useHarvestStore } from '@/stores/useHarvestStore';
import { settingsService } from '@/services/settings.service';
import { notificationService } from '@/services/notification.service';
import { supabase } from '@/services/supabase';
import { logger } from '@/utils/logger';

/** Roles que pueden editar el salario mínimo (valor regulado por ley NZ) */
const WAGE_EDIT_ROLES = new Set(['admin', 'hr_admin']);

export interface SettingsFormData {
    piece_rate: number;
    min_wage_rate: number;
    min_buckets_per_hour: number;
    target_tons: number;
    variety: string;
    /** Hora de inicio de turno (formato HH:MM, 24h) */
    shift_start_time: string;
    /** Hora de fin de turno (formato HH:MM, 24h) */
    shift_end_time: string;
}

export interface ComplianceToggles {
    nz_employment_standards: boolean;
    auto_wage_alerts: boolean;
    safety_verification: boolean;
    audit_trail: boolean;
}

export interface OrchardOption {
    id: string;
    name: string;
    total_rows?: number;
    varieties?: string;
}

export function useSettings() {
    const { orchard, settings, currentUser } = useHarvestStore();
    const orchardId = orchard?.id;

    // Form data
    const [formData, setFormData] = useState<SettingsFormData>({
        piece_rate: settings?.piece_rate ?? 6.5,
        min_wage_rate: settings?.min_wage_rate ?? 23.95,
        min_buckets_per_hour: settings?.min_buckets_per_hour ?? 8,
        target_tons: settings?.target_tons ?? 40,
        variety: settings?.variety ?? 'Cherry',
        shift_start_time: settings?.shift_start_time ?? '07:00',
        shift_end_time: settings?.shift_end_time ?? '17:00',
    });

    const [compliance, setCompliance] = useState<ComplianceToggles>({
        nz_employment_standards: true,
        auto_wage_alerts: true,
        safety_verification: true,
        audit_trail: true,
    });

    // Orchard selector: lista de huertos disponibles para este manager
    const [availableOrchards, setAvailableOrchards] = useState<OrchardOption[]>(
        orchard ? [{ id: orchard.id, name: orchard.name ?? 'Orchard', total_rows: orchard.total_rows }] : []
    );
    const [orchardVarieties, setOrchardVarieties] = useState<string>('—');

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
                variety: settings.variety ?? 'Cherry',
                shift_start_time: settings.shift_start_time ?? '07:00',
                shift_end_time: settings.shift_end_time ?? '17:00',
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

    // Cargar lista de huertos disponibles (para el selector del Issue 4)
    useEffect(() => {
        let cancelled = false;
        async function loadOrchards() {
            try {
                const { data, error } = await supabase
                    .from('orchards')
                    .select('id, name, total_rows, crop_type')
                    .is('deleted_at', null)
                    .order('name');
                if (error || !data || cancelled) return;
                const options: OrchardOption[] = data.map((o: { id: string; name: string; total_rows?: number; crop_type?: string }) => ({
                    id: o.id,
                    name: o.name,
                    total_rows: o.total_rows,
                    varieties: o.crop_type ?? undefined,
                }));
                if (options.length > 0) setAvailableOrchards(options);
            } catch (e) {
                logger.error('[useSettings] Failed to load orchards:', e);
            }
        }
        void loadOrchards();
        return () => { cancelled = true; };
    }, []);

    // Actualizar variedades cuando cambia el huerto seleccionado
    useEffect(() => {
        if (!orchardId) return;
        const found = availableOrchards.find(o => o.id === orchardId);
        setOrchardVarieties(found?.varieties ?? '—');
    }, [orchardId, availableOrchards]);

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

    /** Cambia el huerto activo y auto-rellena Total Rows y Variety */
    const handleOrchardSelect = useCallback((id: string) => {
        const selected = availableOrchards.find(o => o.id === id);
        if (!selected) return;
        // Actualizar el orchard activo en el store (sólo los campos expuestos en Settings)
        useHarvestStore.setState({ orchard: { id: selected.id, name: selected.name, total_rows: selected.total_rows } });
        // Cargar los ajustes de ESE huerto: antes el formulario seguía con los del
        // anterior y al guardar los copiaba encima
        void settingsService.getHarvestSettings(selected.id).then(s => {
            if (!s) return;
            setFormData(prev => ({
                ...prev,
                piece_rate: s.piece_rate,
                min_wage_rate: s.min_wage_rate,
                min_buckets_per_hour: s.min_buckets_per_hour,
                target_tons: s.target_tons,
                variety: s.variety ?? prev.variety,
            }));
        }).catch(e => logger.warn('[Settings] Could not load settings for orchard:', e));
        // Recargar el mapa de bloques para el nuevo orchard
        void useHarvestStore.getState().fetchBlocks(selected.id);
        if (selected.varieties) {
            setFormData(prev => ({ ...prev, variety: selected.varieties as string }));
        }
        setOrchardVarieties(selected.varieties ?? '—');
        setHasChanges(true);
        setSaveStatus('idle');
    }, [availableOrchards]);

    const handleSave = async () => {
        if (!orchardId) return;
        setIsSaving(true);
        setSaveStatus('idle');
        setSaveError(null);
        try {
            const payload = {
                piece_rate: Number(formData.piece_rate),
                min_wage_rate: Number(formData.min_wage_rate),
                min_buckets_per_hour: Number(formData.min_buckets_per_hour),
                target_tons: Number(formData.target_tons),
                variety: formData.variety,
                shift_start_time: formData.shift_start_time,
                shift_end_time: formData.shift_end_time,
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
        formData, handleChange,
        compliance, setCompliance,
        // Permissions & compliance floor
        canEditMinWage,
        complianceFloor,
        // Orchard selector
        availableOrchards,
        orchardVarieties,
        handleOrchardSelect,
        // Save
        isSaving, saveStatus, saveError, hasChanges, handleSave,
        // Notifications
        notifEnabled, notifTypes, notifTestSent,
        handleNotifToggle, handleNotifType, handleSendTest,
    };
}
