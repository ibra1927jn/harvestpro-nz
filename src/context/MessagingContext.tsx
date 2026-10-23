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
import { pendingFiles, QueueFullError } from '@/services/pending-uploads.service';
import {
  attachmentPath,
  chatAttachmentsService,
  MAX_ATTACHMENT_BYTES,
  type ChatAttachment,
} from '@/services/chat-attachments.service';
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
  mutedIdsOf,
  sumUnread,
  withConversationMuted,
  withBroadcastAcknowledged,
  withConversationRead,
  withMessageRead,
  type ConversationRow,
} from './messagingLogic';
import { useMessagingRealtime } from './useMessagingRealtime';
import { mergeOutbox } from './messagingOutbox';

// Types extracted to messaging.types.ts for reuse
import type {
  DBMessage,
  ChatGroup,
  MessagingState,
  MessagingContextType,
  OutgoingAttachment,
  SendAttachmentResult,
} from './messaging.types';
export type { DBMessage, ChatGroup, OutgoingAttachment, SendAttachmentResult } from './messaging.types';

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
  // Silenciadas: sin notificación del sistema (lo lee el efecto de realtime)
  const mutedIdsRef = useRef<Set<string>>(new Set());
  mutedIdsRef.current = mutedIdsOf(state.chatGroups);

  useMessagingRealtime({ setState, userIdRef, orchardIdRef, mutedIdsRef });

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
        // conversations.updated_at lo pone el trigger trg_touch_conversation_on_message

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

  /**
   * Foto / PDF / nota de voz. Con red: sube el archivo y guarda el mensaje.
   * Sin red o si falla: el archivo se guarda cifrado en el móvil (pending_files)
   * y el mensaje va a la bandeja de salida, con el mismo id (no duplica).
   */
  const sendAttachment = async (conversationId: string, file: OutgoingAttachment): Promise<SendAttachmentResult> => {
    const me = userIdRef.current;
    if (!me) return { message: null, error: 'failed' };
    if (file.blob.size <= 0 || file.blob.size > MAX_ATTACHMENT_BYTES) return { message: null, error: 'too_large' };

    const timestamp = nowNZST();
    const content = (file.caption ?? '').trim();
    const optimistic = buildOptimisticMessage(me, conversationId, content, 'normal', orchardIdRef.current || undefined);
    const attachment: ChatAttachment = {
      path: attachmentPath(conversationId, optimistic.id, file.ext),
      type: file.type,
      ...(file.name ? { name: file.name.slice(0, 200) } : {}),
      size: file.blob.size,
      ...(file.durationMs !== undefined ? { duration_ms: Math.round(file.durationMs) } : {}),
    };

    if (navigator.onLine) {
      try {
        await chatAttachmentsService.upload(attachment.path, file.blob, file.mime);
        const data = (await messagingRepository.sendMessage(conversationId, me, content, {
          id: optimistic.id,
          createdAt: timestamp,
          attachment,
        })) as DBMessage | null;
        if (data) return { message: data };
      } catch (error) {
        logger.warn('[MessagingContext] Attachment not sent now, queuing it:', error);
      }
    }

    try {
      await pendingFiles.put(optimistic.id, 'chat', file.blob, file.mime);
    } catch (error) {
      if (error instanceof QueueFullError) return { message: null, error: 'queue_full' };
      logger.error('[MessagingContext] Attachment could not be stored on this device:', error);
      return { message: null, error: 'failed' };
    }
    await messageOutbox.queue({
      id: optimistic.id,
      channel_type: 'direct',
      recipient_id: conversationId,
      sender_id: me,
      content,
      timestamp,
      priority: 'normal',
      upload: { ...attachment, file_id: optimistic.id, mime: file.mime },
    });
    // Con red (falló otra cosa) se reintenta ya: si el servidor lo rechaza sale "No enviado"
    if (navigator.onLine) void messageOutbox.flush().catch(() => undefined);

    return {
      message: {
        ...optimistic,
        content,
        created_at: timestamp,
        delivery: 'pending',
        attachment_path: attachment.path,
        attachment_type: attachment.type,
        attachment_name: attachment.name ?? null,
        attachment_size: attachment.size,
        duration_ms: attachment.duration_ms ?? null,
        local_file_id: optimistic.id,
      },
    };
  };

  const updateConversation = async (
    conversationId: string,
    changes: { name?: string; add?: string[]; remove?: string[] }
  ): Promise<boolean> => {
    try {
      const row = await messagingRepository.updateConversation(conversationId, changes);
      setState(prev => ({
        ...prev,
        chatGroups: prev.chatGroups.map(g =>
          g.id === conversationId ? { ...g, name: row.name || g.name, members: row.participant_ids } : g
        ),
      }));
      return true;
    } catch (error) {
      logger.warn('[MessagingContext] Conversation not updated:', error);
      return false;
    }
  };

  const setConversationMuted = async (conversationId: string, muted: boolean): Promise<boolean> => {
    try {
      await messagingRepository.setMuted(conversationId, muted);
      setState(prev => withConversationMuted(prev, conversationId, muted));
      return true;
    } catch (error) {
      logger.warn('[MessagingContext] Mute not saved:', error);
      return false;
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
        lastMsg: '',
        createdBy: userIdRef.current,
        muted: false,
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
    // Sin huerto (RRHH, nómina, admin de empresa) también hay chat; los avisos sí son por huerto
    if (!userIdRef.current) return;
    const currentUserId = userIdRef.current;
    const orchardId = orchardIdRef.current;

    try {
      // Batch 1: broadcasts y conversations en paralelo — independientes entre sí
      // Antes era secuencial (4 queries en cadena bloqueando el pool)
      logger.info('[CONN-TRACE] refreshMessages batch 1 — broadcasts + conversations (paralelo)');
      const [broadcastsData, convData, unreadMap] = await Promise.all([
        orchardId ? messagingRepository.getBroadcasts(orchardId) : Promise.resolve([]),
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
          : Promise.resolve([] as Array<{ conversation_id: string; content: string; created_at: string; attachment_type?: string | null }>),
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
        unreadCount: sumUnread(unreadMap, mutedIdsOf(chatGroups)),
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
    sendAttachment,
    updateConversation,
    setConversationMuted,
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
