import { describe, it, expect } from 'vitest';
import type { Broadcast } from '../types';
import type { MessagingState, DBMessage } from './messaging.types';
import {
  buildChatGroups,
  buildLastMessageMap,
  collectParticipantIds,
  previewText,
  sumUnread,
  withBroadcastAcknowledged,
  withConversationRead,
  withMessageRead,
  withConversationMuted,
  withUnreadCounts,
  type ConversationRow,
} from './messagingLogic';

const state = (over: Partial<MessagingState> = {}): MessagingState => ({
  messages: [],
  broadcasts: [],
  chatGroups: [],
  unreadCount: 0,
  ...over,
});

const conv = (over: Partial<ConversationRow>): ConversationRow => ({
  id: 'c1',
  name: null,
  type: 'direct',
  participant_ids: ['me', 'u2'],
  updated_at: null,
  ...over,
});

describe('chat list building', () => {
  it('collects the other participants once', () => {
    const ids = collectParticipantIds(
      [conv({ participant_ids: ['me', 'u2'] }), conv({ id: 'c2', participant_ids: ['me', 'u2', 'u3'] }), conv({ id: 'c3', participant_ids: null })],
      'me'
    );
    expect(ids.sort()).toEqual(['u2', 'u3']);
  });

  it('keeps only the newest message per conversation', () => {
    const map = buildLastMessageMap([
      { conversation_id: 'c1', content: 'newest', created_at: '2026-10-13T02:00:00Z' },
      { conversation_id: 'c1', content: 'older', created_at: '2026-10-13T01:00:00Z' },
      { conversation_id: 'c2', content: 'hi', created_at: '2026-10-13T00:00:00Z' },
    ]);
    expect(map.c1.content).toBe('newest');
    expect(map.c2.content).toBe('hi');
    expect(buildLastMessageMap(null)).toEqual({});
  });

  it('truncates long previews to 40 chars with an ellipsis', () => {
    expect(previewText('short')).toBe('short');
    expect(previewText('x'.repeat(41))).toBe('x'.repeat(40) + '…');
    expect(previewText('x'.repeat(40))).toBe('x'.repeat(40));
  });

  it('names DMs after the other people and keeps group names', () => {
    const groups = buildChatGroups({
      conversations: [
        conv({ id: 'dm' }),
        conv({ id: 'g', type: 'group', name: 'Block A crew', participant_ids: ['me', 'u2', 'u3'] }),
        conv({ id: 'g2', type: 'group', name: null, participant_ids: ['me', 'u2', 'ghost'] }),
        conv({ id: 'solo', participant_ids: ['me'] }),
      ],
      me: 'me',
      profileMap: { u2: 'Aroha', u3: 'Ben' },
      lastMsgMap: {},
      unreadMap: { g: 3 },
    });
    expect(groups.map(g => [g.id, g.name, g.isGroup, g.unreadCount])).toEqual([
      ['dm', 'Aroha', false, 0],
      ['g', 'Block A crew', true, 3],
      ['g2', 'Aroha, Unknown', true, 0],
      ['solo', 'Direct Chat', false, 0],
    ]);
  });

  it('shows the time of the last message, else of the last update, else nothing', () => {
    const [withMsg, withUpdate, none] = buildChatGroups({
      conversations: [
        conv({ id: 'a' }),
        conv({ id: 'b', updated_at: '2026-10-12T22:05:00Z' }),
        conv({ id: 'c' }),
      ],
      me: 'me',
      profileMap: {},
      lastMsgMap: { a: { content: 'see you', created_at: '2026-10-12T21:30:00Z' } },
      unreadMap: {},
    });
    // 21:30Z = 10:30 NZDT, 22:05Z = 11:05 NZDT
    expect(withMsg.time).toMatch(/10:30/);
    expect(withMsg.lastMsg).toBe('see you');
    expect(withUpdate.time).toMatch(/11:05/);
    expect(withUpdate.lastMsg).toBe('');
    expect(none.time).toBe('');
  });
});

describe('state transitions', () => {
  const msg = (over: Partial<DBMessage>): DBMessage => ({
    id: 'm1', sender_id: 'u2', content: 'hi', priority: 'normal', read_by: [], created_at: '', ...over,
  });

  it('marks a message read once and never goes below zero', () => {
    const s1 = withMessageRead(state({ messages: [msg({})], unreadCount: 1 }), 'm1', 'me');
    expect(s1.messages[0].read_by).toEqual(['me']);
    expect(s1.unreadCount).toBe(0);
    const s2 = withMessageRead(s1, 'm1', 'me');
    expect(s2.messages[0].read_by).toEqual(['me']);
    expect(s2.unreadCount).toBe(0);
  });

  it('reading a conversation subtracts only its own unread count', () => {
    const s = withConversationRead(
      state({ chatGroups: [{ id: 'a', name: 'A', members: [], unreadCount: 2 }, { id: 'b', name: 'B', members: [], unreadCount: 3 }], unreadCount: 5 }),
      'a'
    );
    expect(s.chatGroups.map(g => g.unreadCount)).toEqual([0, 3]);
    expect(s.unreadCount).toBe(3);
  });

  it('acknowledges a broadcast without duplicating the user', () => {
    const b = { id: 'b1', acknowledged_by: ['u9'] } as unknown as Broadcast;
    const s1 = withBroadcastAcknowledged(state({ broadcasts: [b] }), 'b1', 'me');
    expect(s1.broadcasts[0].acknowledged_by).toEqual(['u9', 'me']);
    expect(withBroadcastAcknowledged(s1, 'b1', 'me').broadcasts[0].acknowledged_by).toEqual(['u9', 'me']);
  });

  it('applies fresh unread counts to every chat and the total', () => {
    const s = withUnreadCounts(
      state({ chatGroups: [{ id: 'a', name: 'A', members: [], unreadCount: 9 }, { id: 'b', name: 'B', members: [] }] }),
      { b: 2, other: 1 }
    );
    expect(s.chatGroups.map(g => g.unreadCount)).toEqual([0, 2]);
    expect(s.unreadCount).toBe(3);
    expect(sumUnread({})).toBe(0);
  });
});

describe('muted chats and attachment previews', () => {
  it('marks my muted chats, keeps the creator and says "photo" when the last message is only a photo', () => {
    const [g] = buildChatGroups({
      conversations: [conv({ id: 'g1', type: 'group', name: 'Crew', created_by: 'u2', muted_by: ['me'] })],
      me: 'me',
      profileMap: {},
      lastMsgMap: buildLastMessageMap([{ conversation_id: 'g1', content: '', created_at: '2026-10-23T10:00:00Z', attachment_type: 'image' }]),
      unreadMap: { g1: 4 },
    });
    expect(g.muted).toBe(true);
    expect(g.createdBy).toBe('u2');
    expect(g.lastMsg).toBe('');
    expect(g.lastAttachmentType).toBe('image');
    const [other] = buildChatGroups({
      conversations: [conv({ muted_by: ['someone-else'] })],
      me: 'me', profileMap: {}, lastMsgMap: {}, unreadMap: {},
    });
    expect(other.muted).toBe(false);
  });

  it('muted chats do not count in the total (their own number stays)', () => {
    expect(sumUnread({ a: 2, b: 3 }, new Set(['b']))).toBe(2);
    const s = withConversationMuted(
      state({ chatGroups: [{ id: 'a', name: 'A', members: [], unreadCount: 2 }, { id: 'b', name: 'B', members: [], unreadCount: 3 }], unreadCount: 5 }),
      'b', true
    );
    expect(s.unreadCount).toBe(2);
    expect(s.chatGroups[1]).toMatchObject({ muted: true, unreadCount: 3 });
    expect(withConversationMuted(s, 'b', false).unreadCount).toBe(5);
    // Leer una silenciada no descuenta del total
    expect(withConversationRead(s, 'b').unreadCount).toBe(2);
    expect(withUnreadCounts(s, { a: 1, b: 7 }).unreadCount).toBe(1);
  });
});
