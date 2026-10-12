/**
 * useMessagingActions — Extracted messaging data builders
 *
 * Pure utility functions extracted from MessagingContext.tsx to reduce
 * file size and improve testability. These handle data transformation
 * logic that doesn't depend on React state.
 *
 * @module hooks/useMessagingActions
 */
import { nowNZST } from '@/utils/nzst';
import { Role, MessagePriority, Broadcast } from '@/types';
import type { DBMessage, ChatGroup } from '@/context/messaging.types';

// =============================================
// OPTIMISTIC MESSAGE BUILDER
// =============================================

/** Build an optimistic message for immediate UI display before server confirmation */
export function buildOptimisticMessage(
  senderId: string,
  conversationId: string,
  content: string,
  priority: MessagePriority,
  orchardId?: string
): DBMessage {
  return {
    id: crypto.randomUUID(),
    sender_id: senderId,
    content,
    priority,
    read_by: [senderId],
    created_at: nowNZST(),
    orchard_id: orchardId,
    conversation_id: conversationId,
  } as DBMessage;
}

// =============================================
// BROADCAST BUILDER
// =============================================

/** Build a broadcast object for immediate UI display */
export function buildBroadcast(
  senderId: string,
  orchardId: string,
  title: string,
  content: string,
  priority: MessagePriority,
  targetRoles?: Role[]
): Broadcast {
  return {
    id: crypto.randomUUID(),
    orchard_id: orchardId,
    sender_id: senderId,
    title,
    content,
    priority,
    target_roles: targetRoles || [Role.TEAM_LEADER, Role.RUNNER],
    acknowledged_by: [],
    created_at: nowNZST(),
  };
}

// =============================================
// CHAT GROUP DATA RESOLVER
// =============================================

interface ConversationData {
  id: string;
  name?: string;
  type?: string;
  participant_ids: string[];
  updated_at?: string;
}

interface LastMessageData {
  conversation_id: string;
  content: string;
  created_at: string;
}

/**
 * Build ChatGroup list from raw conversation data, profile names, and last messages.
 * Extracted from refreshMessages() — ~40 LOC of pure data transformation.
 */
export function buildChatGroups(
  conversations: ConversationData[],
  currentUserId: string,
  profileMap: Record<string, string>,
  lastMessages: LastMessageData[]
): ChatGroup[] {
  // Index last messages by conversation ID
  const lastMsgMap: Record<string, { content: string; created_at: string }> = {};
  lastMessages.forEach(m => {
    if (!lastMsgMap[m.conversation_id]) {
      lastMsgMap[m.conversation_id] = { content: m.content, created_at: m.created_at };
    }
  });

  return conversations.map(c => {
    let displayName = c.name;
    const isDirect = c.type !== 'group';

    if (isDirect || !displayName) {
      const otherIds = (c.participant_ids || []).filter(pid => pid !== currentUserId);
      const otherNames = otherIds.map(pid => profileMap[pid] || 'Unknown');
      displayName = otherNames.length > 0 ? otherNames.join(', ') : 'Direct Chat';
    }

    const lastMsg = lastMsgMap[c.id];
    const timeStr = lastMsg
      ? new Date(lastMsg.created_at).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })
      : c.updated_at
        ? new Date(c.updated_at).toLocaleTimeString([], { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })
        : '';

    return {
      id: c.id,
      name: displayName!,
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
}
