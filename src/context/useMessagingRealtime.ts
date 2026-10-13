/**
 * useMessagingRealtime — efectos de MessagingContext que escuchan fuera:
 * bandeja de salida (offline), avisos (broadcasts) y mensajes nuevos.
 */
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { supabase } from '../services/supabase';
import { messageOutbox } from '@/services/message-outbox.service';
import { showSystemNotification } from '@/utils/systemNotification';
import type { Broadcast } from '../types';
import { logger } from '@/utils/logger';
import { messagingRepository } from '@/repositories/messaging.repository';
import type { MessagingState } from './messaging.types';
import { withUnreadCounts } from './messagingLogic';

export function useMessagingRealtime(params: {
  setState: Dispatch<SetStateAction<MessagingState>>;
  userIdRef: MutableRefObject<string | null>;
  orchardIdRef: MutableRefObject<string | null>;
}): void {
  const { setState, userIdRef, orchardIdRef } = params;

  // Mensajes que no salieron: se envían al abrir la app y al volver la conexión
  useEffect(() => {
    const flush = () => {
      messageOutbox.flush()
        .then(n => { if (n > 0) logger.info(`[MessagingContext] Sent ${n} queued message(s)`); })
        .catch(e => logger.warn('[MessagingContext] Outbox flush failed:', e));
    };
    const t = setTimeout(flush, 3000);
    window.addEventListener('online', flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', flush);
    };
  }, []);

  // Avisos nuevos del huerto: al estado, vibración y notificación del sistema
  useEffect(() => {
    if (!orchardIdRef.current) return;

    const channel = supabase
      .channel('public:broadcasts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcasts',
          filter: `orchard_id=eq.${orchardIdRef.current}`,
        },
        payload => {
          const newBroadcast = payload.new as Broadcast;
          setState(prev => {
            if (prev.broadcasts.some(b => b.id === newBroadcast.id)) return prev;
            return { ...prev, broadcasts: [newBroadcast, ...prev.broadcasts] };
          });

          try {
            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200, 100, 500]);
            }
            void showSystemNotification(`📢 ${newBroadcast.title}`, newBroadcast.content, `broadcast-${newBroadcast.id}`);
          } catch (e) {
            logger.warn('[MessagingContext] Feedback trigger failed', e);
          }
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[MessagingContext] Broadcast subscription active');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-suscribir si cambia el huerto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchardIdRef.current]);

  // Mensajes nuevos (RLS: solo de mis conversaciones) → contadores al día
  useEffect(() => {
    const channel = supabase
      .channel('my-chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const msg = payload.new as { sender_id?: string; content?: string; conversation_id?: string };
        if (!userIdRef.current || msg.sender_id === userIdRef.current) return;
        messagingRepository.getUnreadCounts().then(map => {
          setState(prev => withUnreadCounts(prev, map));
        }).catch(() => undefined);
        if (document.hidden && msg.content) {
          void showSystemNotification('New message', msg.content.slice(0, 120), `chat-${msg.conversation_id}`);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [setState, userIdRef]);
}
