/**
 * MessagingContext - Real-time Messaging and Broadcast Management
 *
 * **Architecture**: React Context API
 * **Why Context?**: Complex real-time subscriptions, moderate update frequency
 * **Features**: Offline queueing, real-time notifications, broadcast system
 * **See**: `docs/architecture/state-management.md` for decision rationale
 *
 * Lógica pura: messagingLogic.ts · Realtime y bandeja de salida: useMessagingRealtime.ts
 *
 * @module context/MessagingContext
 */
import React, { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import { messageOutbox } from '@/services/message-outbox.service';
import { Role, MessagePriority } from '../types';
import { nowNZST } from '@/utils/nzst';
import { logger } from '@/utils/logger';
import { messagingRepository } from '@/repositories/messaging.repository';
import { userRepository2 } from '@/repositories/user.repository';
import { analytics } from '@/config/analytics';
import { buildOptimisticMessage, buildBroadcast } from '@/hooks/useMessagingActions';
import {
  buildChatGroups,
  buildLastMessageMap,
  collectParticipantIds,
  sumUnread,
  withBroadcastAcknowledged,
  withConversationRead,
  withMessageRead,
  type ConversationRow,
} from './messagingLogic';
import { useMessagingRealtime } from './useMessagingRealtime';
import { mergeOutbox } from './messagingOutbox';

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
  useMessagingRealtime({ setState, userIdRef, orchardIdRef });

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

      return { ...optimisticMsg, delivery: 'pending' };
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

    const me = userIdRef.current;
    setState(prev => withMessageRead(prev, messageId, me));
  };

  const markConversationRead = async (conversationId: string) => {
    if (!userIdRef.current) return;
    // En pantalla al momento; en el servidor para que no vuelva a salir
    setState(prev => withConversationRead(prev, conversationId));
    try {
      await messagingRepository.markConversationRead(conversationId);
    } catch (e) {
      logger.warn('[MessagingContext] Could not mark conversation read:', e);
    }
  };

  const acknowledgeBroadcast = async (broadcastId: string) => {
    if (!userIdRef.current) return;
    try {
      // Antes solo cambiaba la pantalla y no se guardaba
      await messagingRepository.acknowledgeBroadcast(broadcastId);
    } catch (e) {
      logger.warn('[MessagingContext] Could not acknowledge broadcast:', e);
      return;
    }

    const me = userIdRef.current;
    setState(prev => withBroadcastAcknowledged(prev, broadcastId, me));
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
    let serverMessages: DBMessage[] = [];
    try {
      serverMessages = (await messagingRepository.getConversationMessages(conversationId)) || [];
    } catch (error) {
      logger.error('[MessagingContext] Error loading conversation:', error);
    }
    // Lo propio que aún no llegó (sin red o rechazado) también se ve, marcado
    try {
      const outbox = await messageOutbox.forConversation(conversationId);
      return mergeOutbox(serverMessages, outbox);
    } catch (error) {
      logger.warn('[MessagingContext] Outbox not readable:', error);
      return serverMessages;
    }
  };

  const retryMessage = useCallback(async (messageId: string) => {
    await messageOutbox.retry(messageId);
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!orchardIdRef.current || !userIdRef.current) return;
    const currentUserId = userIdRef.current;

    try {
      // Batch 1: broadcasts y conversations en paralelo — independientes entre sí
      // Antes era secuencial (4 queries en cadena bloqueando el pool)
      logger.info('[CONN-TRACE] refreshMessages batch 1 — broadcasts + conversations (paralelo)');
      const [broadcastsData, convData, unreadMap] = await Promise.all([
        messagingRepository.getBroadcasts(orchardIdRef.current),
        messagingRepository.getConversations(currentUserId),
        messagingRepository.getUnreadCounts().catch(() => ({} as Record<string, number>)),
      ]);

      const conversations = (convData || []) as ConversationRow[];
      const participantIds = collectParticipantIds(conversations, currentUserId);
      const convIds = conversations.map(c => c.id);

      // Batch 2: profiles y lastMessages en paralelo — ambos dependen de convData pero no entre sí
      logger.info('[CONN-TRACE] refreshMessages batch 2 — profiles + lastMsgs (paralelo)');
      const [profileMap, lastMsgs] = await Promise.all([
        participantIds.length > 0
          ? userRepository2.getNamesByIds(participantIds)
          : Promise.resolve({} as Record<string, string>),
        convIds.length > 0
          ? messagingRepository.getLastMessages(convIds)
          : Promise.resolve([] as Array<{ conversation_id: string; content: string; created_at: string }>),
      ]);

      const chatGroups = buildChatGroups({
        conversations,
        me: currentUserId,
        profileMap,
        lastMsgMap: buildLastMessageMap(lastMsgs),
        unreadMap,
      });

      setState(prev => ({
        ...prev,
        broadcasts: broadcastsData || [],
        chatGroups,
        unreadCount: sumUnread(unreadMap),
      }));
    } catch (error) {
      logger.error('[MessagingContext] Error refreshing messages:', error);
    }
  // refs son estables — no necesita deps
  }, []);

  // =============================================
  // CONTEXT VALUE
  // =============================================
  const contextValue: MessagingContextType = {
    ...state,
    sendMessage,
    sendBroadcast,
    getOrCreateConversation,
    markMessageRead,
    markConversationRead,
    acknowledgeBroadcast,
    createChatGroup,
    loadChatGroups,
    loadConversation,
    retryMessage,
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
