/**
 * Tests for useMessagingActions — pure utility functions
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/nzst', () => ({
  nowNZST: () => '2026-03-10T14:00:00+13:00',
}));

import { buildOptimisticMessage, buildBroadcast, buildChatGroups } from './useMessagingActions';

describe('buildOptimisticMessage', () => {
  it('creates a message with correct fields', () => {
    const msg = buildOptimisticMessage('sender1', 'conv1', 'Hello!', 'normal', 'o1');
    expect(msg.sender_id).toBe('sender1');
    expect(msg.content).toBe('Hello!');
    expect(msg.priority).toBe('normal');
    expect(msg.conversation_id).toBe('conv1');
    expect(msg.orchard_id).toBe('o1');
    expect(msg.read_by).toContain('sender1');
    expect(msg.id).toBeDefined();
  });

  it('generates unique IDs', () => {
    const msg1 = buildOptimisticMessage('s', 'c', 'a', 'normal');
    const msg2 = buildOptimisticMessage('s', 'c', 'b', 'normal');
    expect(msg1.id).not.toBe(msg2.id);
  });
});

describe('buildBroadcast', () => {
  it('creates a broadcast with correct fields', () => {
    const bc = buildBroadcast('sender1', 'o1', 'Alert', 'Important message', 'urgent');
    expect(bc.sender_id).toBe('sender1');
    expect(bc.title).toBe('Alert');
    expect(bc.content).toBe('Important message');
    expect(bc.priority).toBe('urgent');
    expect(bc.orchard_id).toBe('o1');
    expect(bc.acknowledged_by).toEqual([]);
  });

  it('defaults to everyone (empty target_roles) when not provided', () => {
    const bc = buildBroadcast('s', 'o1', 'T', 'C', 'normal');
    expect(bc.target_roles).toEqual([]);
  });

  it('uses custom target_roles when provided', () => {
    const bc = buildBroadcast('s', 'o1', 'T', 'C', 'normal', ['manager' as never]);
    expect(bc.target_roles).toContain('manager');
  });
});

describe('buildChatGroups', () => {
  const conversations = [
    {
      id: 'c1',
      name: null,
      type: 'direct',
      participant_ids: ['me', 'other1'],
      updated_at: '2026-03-10T12:00:00Z',
    },
    {
      id: 'c2',
      name: 'Team Chat',
      type: 'group',
      participant_ids: ['me', 'other1', 'other2'],
      updated_at: '2026-03-10T11:00:00Z',
    },
  ];
  const profileMap = { other1: 'Alice', other2: 'Bob' };
  const lastMessages = [
    { conversation_id: 'c1', content: 'Hey there!', created_at: '2026-03-10T13:00:00Z' },
  ];

  it('builds chat groups from conversations', () => {
    const groups = buildChatGroups(conversations as never[], 'me', profileMap, lastMessages);
    expect(groups).toHaveLength(2);
  });

  it('resolves direct chat names from profile map', () => {
    const groups = buildChatGroups(conversations as never[], 'me', profileMap, lastMessages);
    expect(groups[0].name).toBe('Alice');
  });

  it('keeps group name for group chats', () => {
    const groups = buildChatGroups(conversations as never[], 'me', profileMap, lastMessages);
    expect(groups[1].name).toBe('Team Chat');
  });

  it('includes last message content', () => {
    const groups = buildChatGroups(conversations as never[], 'me', profileMap, lastMessages);
    expect(groups[0].lastMsg).toBe('Hey there!');
  });

  it('truncates long messages', () => {
    const longMsg = [
      { conversation_id: 'c1', content: 'A'.repeat(50), created_at: '2026-03-10T13:00:00Z' },
    ];
    const groups = buildChatGroups(conversations as never[], 'me', profileMap, longMsg);
    expect(groups[0].lastMsg.length).toBeLessThanOrEqual(41);
  });

  it('handles empty conversations', () => {
    const groups = buildChatGroups([], 'me', {}, []);
    expect(groups).toEqual([]);
  });
});
