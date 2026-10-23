/**
 * Push Repository — suscripciones push de este dispositivo (push_subscriptions).
 *
 * El alta va por la RPC register_push_subscription: un endpoint es un
 * dispositivo y pertenece a una sola cuenta (si el móvil lo usaba otra, su fila
 * se borra en el servidor). Borrar y cambiar los tipos silenciados: la fila propia (RLS).
 */
import { supabase } from '@/services/supabase';

export type PushMuteType = 'qc_reject' | 'transport' | 'attendance' | 'visa_expiry';

export interface PushSubscriptionRecord {
    endpoint: string;
    keys_p256dh: string;
    keys_auth: string;
    user_agent: string;
    muted_types: PushMuteType[];
}

export const pushRepository = {
    /** Alta o renovación de la suscripción de este dispositivo para quien tiene la sesión */
    async register(record: PushSubscriptionRecord): Promise<{ error: { message: string } | null }> {
        const { error } = await supabase.rpc('register_push_subscription', {
            p_endpoint: record.endpoint,
            p_p256dh: record.keys_p256dh,
            p_auth: record.keys_auth,
            p_user_agent: record.user_agent,
            p_muted_types: record.muted_types,
        });
        return { error: error ? { message: error.message } : null };
    },

    /** Este dispositivo deja de recibir avisos de esta cuenta */
    async delete(endpoint: string): Promise<{ error: { message: string } | null }> {
        const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
        return { error: error ? { message: error.message } : null };
    },

    /** Tipos de aviso que este dispositivo no quiere (casillas de Ajustes) */
    async setMutedTypes(endpoint: string, muted: PushMuteType[]): Promise<{ error: { message: string } | null }> {
        const { error } = await supabase
            .from('push_subscriptions')
            .update({ muted_types: muted, updated_at: new Date().toISOString() })
            .eq('endpoint', endpoint);
        return { error: error ? { message: error.message } : null };
    },
};
