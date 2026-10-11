/**
 * OrchardDataBootstrap — carga los datos del huerto del usuario para TODOS los
 * roles (cuadrilla, cubetas de hoy, configuración de pago, tiempo real).
 *
 * Antes solo Manager, Team Leader y Runner llamaban a fetchGlobalData; Nómina,
 * HR, QC y Logística se quedaban sin huerto en el store y sus pantallas salían
 * vacías (p. ej. QC sin cuadrilla, Nómina a 0). Se monta una vez en ProtectedRoute
 * y usa el huerto asignado al usuario, no "el primer huerto" de la base de datos.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useHarvestStore } from '@/stores/useHarvestStore';

export const OrchardDataBootstrap = () => {
    const { appUser } = useAuth();
    const fetchGlobalData = useHarvestStore(s => s.fetchGlobalData) as (orchardId?: string) => Promise<void>;
    const loadedFor = useRef<string | null>(null);

    useEffect(() => {
        if (!appUser?.id) return;
        const key = `${appUser.id}|${appUser.orchard_id ?? ''}`;
        if (loadedFor.current === key) return;
        loadedFor.current = key;
        fetchGlobalData(appUser.orchard_id || undefined);
    }, [appUser?.id, appUser?.orchard_id, fetchGlobalData]);

    return null;
};
