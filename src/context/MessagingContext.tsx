/**
 * MessagingContext - Real-time Messaging and Broadcast Management
 *
 * **Architecture**: React Context API
 * **Why Context?**: Complex real-time subscriptions, moderate update frequency
 * **Features**: Offline queueing, real-time notifications, broadcast system
 * **See**: `docs/architecture/state-management.md` for decision rationale
 *
 * @module context/MessagingContext
 * @see {@link file:///c:/Users/ibrab/Downloads/app/harvestpro-nz%20%281%29/docs/architecture/state-management.md}
 */
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { messageOutbox } from '@/services/message-outbox.service';
import { Broadcast, Role, MessagePriority } from '../types';
import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { messagingRepository } from '@/repositories/messaging.repository';
import { userRepository2 } from '@/repositories/user.repository';
import { analytics } from '@/config/analytics';
import { buildOptimisticMessage, buildBroadcast } from '@/hooks/useMessagingActions';

// Types extracted to messaging.types.ts for reuse
import type { DBMessage, ChatGroup, MessagingState, MessagingContextType } from './messaging.types';
export type { DBMessage, ChatGroup } from './messaging.types';

// =============================================
// CONTEXT
// =============================================
const MessagingContext = createContext<MessagingContextType | undefined>(undefined);

// =============================================
// PROVIDER
// =============================================
export const MessagingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MessagingState>({
    messages: [],
    broadcasts: [],
    chatGroups: [],
    unreadCount: 0,
  });

  const userIdRef = useRef<string | null>(null);
  const orchardIdRef = useRef<string | null>(null);

  const setUserId = useCallback((id: string) => {
    userIdRef.current = id;
  }, []);

  const setOrchardId = useCallback((id: string) => {
    orchardIdRef.current = id;
  }, []);

  // =============================================
  // MESSAGE ACTIONS
  // =============================================
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

  const sendMessage = async (
    conversationId: string,
    content: string,
    priority: MessagePriority = 'normal'
  ): Promise<DBMessage | null> => {
    if (!userIdRef.current) {
      logger.error('[MessagingContext] No user ID set');
      return null;
    }

    const timestamp = nowNZST();

    // 1. Optimistic UI Update
    const optimisticMsg = buildOptimisticMessage(
      userIdRef.current,
      conversationId,
      content,
      priority,
      orchardIdRef.current || undefined
    );

    setState(prev => ({
      ...prev,
      messages: [optimisticMsg, ...prev.messages],
    }));

    try {
      // 2. Try Online Send
      if (navigator.onLine) {
        const data = await messagingRepository.sendMessage(
          conversationId,
          userIdRef.current,
          content,
          { id: optimisticMsg.id, createdAt: timestamp }
        );

        if (!data) throw new Error('Send failed');

        // Update Conversation updated_at
        await messagingRepository.updateConversationTimestamp(conversationId);

        return data;
      } else {
        throw new Error('Offline');
      }
    } catch (error) {
      logger.warn('[MessagingContext] Offline/Error, queuing message...', error);

      // 3. Bandeja de salida: se envía sola al volver la conexión
      await messageOutbox.queue({
        id: optimisticMsg.id,
        channel_type: 'direct',
        recipient_id: conversationId,
        sender_id: userIdRef.current,
        content,
        timestamp,
        priority,
      });

      return optimisticMsg;
    }
  };

  const sendBroadcast = async (
    title: string,
    content: string,
    priority: MessagePriority = 'normal',
    targetRoles?: Role[]
  ) => {
    if (!userIdRef.current || !orchardIdRef.current) return false;

    try {
      const broadcast = buildBroadcast(
        userIdRef.current,
        orchardIdRef.current,
        title,
        content,
        priority,
        targetRoles
      );

      await messagingRepository.insertBroadcast({ ...broadcast });

      setState(prev => ({
        ...prev,
        broadcasts: [broadcast, ...prev.broadcasts],
      }));
      // 📊 PostHog: Track broadcast sent
      analytics.trackBroadcast((targetRoles || [Role.TEAM_LEADER, Role.RUNNER]).length, priority);
      return true;
    } catch (error) {
      logger.error('[MessagingContext] Error sending broadcast:', error);
      return false;
    }
  };

  const getOrCreateConversation = async (participantId: string): Promise<string | null> => {
    if (!userIdRef.current) return null;

    try {
      // Find direct conversation with exactly these participants
      const existing = await messagingRepository.findDirectConversation(
        userIdRef.current,
        participantId
      );

      // Filter locally to ensure ONLY these two participants (Supabase 'contains' might match 3+)
      const match = existing?.[0];

      if (match) return match.id;

      // Create new direct conversation
      const newConv = await messagingRepository.createConversation(
        'direct',
        [userIdRef.current, participantId],
        userIdRef.current
      );

      if (!newConv) throw new Error('Failed to create conversation');
      return newConv.id;
    } catch (error) {
      logger.error('[MessagingContext] Error getOrCreateConversation:', error);
      return null;
    }
  };

  const markMessageRead = async (messageId: string) => {
    if (!userIdRef.current) return;

    setState(prev => ({
      ...prev,
      messages: prev.messages.map(m =>
        m.id === messageId && !m.read_by.includes(userIdRef.current!)
          ? { ...m, read_by: [...m.read_by, userIdRef.current!] }
          : m
      ),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
  };

  const acknowledgeBroadcast = async (broadcastId: string) => {
    if (!userIdRef.current) return;

    setState(prev => ({
      ...prev,
      broadcasts: prev.broadcasts.map(b =>
        b.id === broadcastId && !b.acknowledged_by.includes(userIdRef.current!)
          ? { ...b, acknowledged_by: [...b.acknowledged_by, userIdRef.current!] }
          : b
      ),
    }));
  };

  // =============================================
  // CHAT GROUPS
  // =============================================
  const createChatGroup = async (name: string, memberIds: string[]): Promise<ChatGroup | null> => {
    if (!userIdRef.current) return null;

    try {
      const allParticipants = [...new Set([userIdRef.current, ...memberIds])];

      const { data, error } = await messagingRepository.createGroupConversation(
        name,
        allParticipants,
        userIdRef.current
      );

      if (error) throw error;

      const group: ChatGroup = {
        id: data.id,
        name: data.name,
        members: data.participant_ids,
        isGroup: true,
        lastMsg: 'Group created',
        time: new Date().toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' }),
      };

      setState(prev => ({
        ...prev,
        chatGroups: [group, ...prev.chatGroups],
      }));

      return group;
    } catch (error) {
      logger.error('[MessagingContext] Error creating group:', error);
      throw error;
    }
  };

  const loadChatGroups = async () => {
    // In a real app, load from Supabase
    // For now, just return empty - groups are managed locally
  };

  const loadConversation = async (conversationId: string): Promise<DBMessage[]> => {
    try {
      const data = await messagingRepository.getConversationMessages(conversationId);
      return data || [];
    } catch (error) {
      logger.error('[MessagingContext] Error loading conversation:', error);
      return [];
    }
  };

  const refreshMessages = useCallback(async () => {
    if (!orchardIdRef.current || !userIdRef.current) return;
    const currentUserId = userIdRef.current;

    try {
      // Batch 1: broadcasts y conversations en paralelo — independientes entre sí
      // Antes era secuencial (4 queries en cadena bloqueando el pool)
      logger.info('[CONN-TRACE] refreshMessages batch 1 — broadcasts + conversations (paralelo)');
      const [broadcastsData, convData] = await Promise.all([
        messagingRepository.getBroadcasts(orchardIdRef.current),
        messagingRepository.getConversations(currentUserId),
      ]);

      // Collect unique participant IDs to resolve names
      const participantIds = new Set<string>();
      (convData || []).forEach(c => {
        (c.participant_ids || []).forEach((pid: string) => {
          if (pid !== currentUserId) participantIds.add(pid);
        });
      });

      const convIds = (convData || []).map(c => c.id);

      // Batch 2: profiles y lastMessages en paralelo — ambos dependen de convData pero no entre sí
      logger.info('[CONN-TRACE] refreshMessages batch 2 — profiles + lastMsgs (paralelo)');
      const [profileMap, lastMsgs] = await Promise.all([
        participantIds.size > 0
          ? userRepository2.getNamesByIds(Array.from(participantIds))
          : Promise.resolve({} as Record<string, string>),
        convIds.length > 0
          ? messagingRepository.getLastMessages(convIds)
          : Promise.resolve([] as Array<{ conversation_id: string; content: string; created_at: string }>),
      ]);

      // Build lastMsgMap
      const lastMsgMap: Record<string, { content: string; created_at: string }> = {};
      if (lastMsgs) {
        lastMsgs.forEach(
          (m: { conversation_id: string; content: string; created_at: string }) => {
            if (!lastMsgMap[m.conversation_id]) {
              lastMsgMap[m.conversation_id] = { content: m.content, created_at: m.created_at };
            }
          }
        );
      }

      // 6. Build chat groups with resolved names
      const chatGroups: ChatGroup[] = (convData || []).map(c => {
        let displayName = c.name;
        const isDirect = c.type !== 'group';

        if (isDirect || !displayName) {
          // For DMs: show the other participant's name
          const otherIds = (c.participant_ids || []).filter((pid: string) => pid !== currentUserId);
          const otherNames = otherIds.map((pid: string) => profileMap[pid] || 'Unknown');
          displayName = otherNames.length > 0 ? otherNames.join(', ') : 'Direct Chat';
        }

        const lastMsg = lastMsgMap[c.id];
        const timeStr = lastMsg
          ? new Date(lastMsg.created_at).toLocaleTimeString([], { timeZone: 'Pacific/Auckland',
              hour: '2-digit',
              minute: '2-digit',
            })
          : c.updated_at
            ? new Date(c.updated_at).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })
            : '';

        return {
          id: c.id,
          name: displayName,
          members: c.participant_ids,
          isGroup: c.type === 'group',
          lastMsg: lastMsg
            ? lastMsg.content.length > 40
              ? lastMsg.content.substring(0, 40) + '…'
              : lastMsg.content
            : '',
          time: timeStr,
          unreadCount: 0,
        };
      });

      setState(prev => ({
        ...prev,
        broadcasts: broadcastsData || [],
        chatGroups,
      }));
    } catch (error) {
      logger.error('[MessagingContext] Error refreshing messages:', error);
    }
  // refs son estables — no necesita deps
  }, []);

  // =============================================
  // REALTIME UPDATES
  // =============================================
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
          filter: `orchard_id=eq.${orchardIdRef.current}`, // Filter by orchard
        },
        payload => {
          const newBroadcast = payload.new as Broadcast;

          // 1. Update State
          setState(prev => {
            // Avoid duplicates
            if (prev.broadcasts.some(b => b.id === newBroadcast.id)) return prev;
            return {
              ...prev,
              broadcasts: [newBroadcast, ...prev.broadcasts],
            };
          });

          try {
            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200, 100, 500]);
            }

            if (Notification.permission === 'granted') {
              new Notification(`📢 ${newBroadcast.title}`, {
                body: newBroadcast.content,
                icon: '/pwa-192x192.png',
              });
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orchardIdRef.current]); // Re-subscribe if orchard changes

  // =============================================
  // CONTEXT VALUE
  // =============================================
  const contextValue: MessagingContextType = {
    ...state,
    sendMessage,
    sendBroadcast,
    getOrCreateConversation,
    markMessageRead,
    acknowledgeBroadcast,
    createChatGroup,
    loadChatGroups,
    loadConversation,
    refreshMessages,
    setOrchardId,
    setUserId,
  };

  return <MessagingContext.Provider value={contextValue}>{children}</MessagingContext.Provider>;
};

// =============================================
// HOOK
// =============================================
export const useMessaging = (): MessagingContextType => {
  const context = useContext(MessagingContext);
  if (!context) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
};

export default MessagingContext;
