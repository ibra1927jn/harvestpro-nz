/**
 * messagingLogic — lógica pura de MessagingContext (sin Supabase ni React).
 *
 * Construcción de la lista de chats y transiciones de estado (leídos,
 * confirmaciones, contadores) para poder probarlas sin red.
 */
import type { ChatGroup, MessagingState } from './messaging.types';
import { formatNZTime } from '@/utils/nzFormat';

/** Conversación tal como llega de la tabla conversations */
export interface ConversationRow {
  id: string;
  name: string | null;
  type: string;
  participant_ids: string[] | null;
  updated_at: string | null;
}

export interface LastMessageRow {
  conversation_id: string;
  content: string;
  created_at: string;
}

/** Longitud máxima de la vista previa del último mensaje */
const PREVIEW_MAX_CHARS = 40;

// Hora NZ en 24 h (antes con el formato del móvil: "1:05 pm" / "13:05")
const timeNZ = (iso: string): string => formatNZTime(iso);

/** Total de no leídos a partir del mapa por conversación */
export function sumUnread(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

/** Participantes de mis conversaciones menos yo (para resolver nombres) */
export function collectParticipantIds(convs: ConversationRow[], me: string): string[] {
  const ids = new Set<string>();
  for (const c of convs) for (const pid of c.participant_ids || []) if (pid !== me) ids.add(pid);
  return Array.from(ids);
}

/** Último mensaje por conversación (la lista llega ordenada del más nuevo al más viejo) */
export function buildLastMessageMap(
  lastMsgs: LastMessageRow[] | null | undefined
): Record<string, { content: string; created_at: string }> {
  const map: Record<string, { content: string; created_at: string }> = {};
  for (const m of lastMsgs || []) {
    if (!map[m.conversation_id]) map[m.conversation_id] = { content: m.content, created_at: m.created_at };
  }
  return map;
}

/** Vista previa recortada del último mensaje */
export function previewText(content: string): string {
  return content.length > PREVIEW_MAX_CHARS ? content.substring(0, PREVIEW_MAX_CHARS) + '…' : content;
}

/**
 * Lista de chats con nombres resueltos: en un directo (o grupo sin nombre)
 * se muestran los otros participantes; hora del último mensaje o, si no hay,
 * de la última actualización (hora NZ).
 */
export function buildChatGroups(params: {
  conversations: ConversationRow[];
  me: string;
  profileMap: Record<string, string>;
  lastMsgMap: Record<string, { content: string; created_at: string }>;
  unreadMap: Record<string, number>;
}): ChatGroup[] {
  const { conversations, me, profileMap, lastMsgMap, unreadMap } = params;
  return conversations.map(c => {
    let displayName = c.name;
    if (c.type !== 'group' || !displayName) {
      const otherNames = (c.participant_ids || [])
        .filter(pid => pid !== me)
        .map(pid => profileMap[pid] || 'Unknown');
      displayName = otherNames.length > 0 ? otherNames.join(', ') : 'Direct Chat';
    }
    const lastMsg = lastMsgMap[c.id];
    const time = lastMsg ? timeNZ(lastMsg.created_at) : c.updated_at ? timeNZ(c.updated_at) : '';
    return {
      id: c.id,
      name: displayName,
      members: c.participant_ids as string[],
      isGroup: c.type === 'group',
      lastMsg: lastMsg ? previewText(lastMsg.content) : '',
      time,
      unreadCount: unreadMap[c.id] ?? 0,
    };
  });
}

/* ── Transiciones de estado ──────────────── */

/** Marca un mensaje como leído por mí y baja el contador global */
export function withMessageRead(prev: MessagingState, messageId: string, me: string): MessagingState {
  return {
    ...prev,
    messages: prev.messages.map(m =>
      m.id === messageId && !m.read_by.includes(me) ? { ...m, read_by: [...m.read_by, me] } : m
    ),
    unreadCount: Math.max(0, prev.unreadCount - 1),
  };
}

/** Conversación leída: su contador a 0 y se descuenta del total */
export function withConversationRead(prev: MessagingState, conversationId: string): MessagingState {
  const was = prev.chatGroups.find(g => g.id === conversationId)?.unreadCount ?? 0;
  return {
    ...prev,
    chatGroups: prev.chatGroups.map(g => (g.id === conversationId ? { ...g, unreadCount: 0 } : g)),
    unreadCount: Math.max(0, prev.unreadCount - was),
  };
}

/** Aviso confirmado por mí (sin duplicar) */
export function withBroadcastAcknowledged(prev: MessagingState, broadcastId: string, me: string): MessagingState {
  return {
    ...prev,
    broadcasts: prev.broadcasts.map(b =>
      b.id === broadcastId && !b.acknowledged_by.includes(me)
        ? { ...b, acknowledged_by: [...b.acknowledged_by, me] }
        : b
    ),
  };
}

/** Contadores de no leídos recién pedidos al servidor */
export function withUnreadCounts(prev: MessagingState, map: Record<string, number>): MessagingState {
  return {
    ...prev,
    chatGroups: prev.chatGroups.map(g => ({ ...g, unreadCount: map[g.id] ?? 0 })),
    unreadCount: sumUnread(map),
  };
}
