/**
 * UnifiedMessagingView — Orchestrator tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { role: 'manager' } }),
}));

vi.mock('@/context/MessagingContext', () => {
  const loadConversation = vi.fn();
  const sendMessage = vi.fn();
  const sendBroadcast = vi.fn();
  const getOrCreateConversation = vi.fn();
  const createChatGroup = vi.fn();
  const refreshMessages = vi.fn();

  return {
    useMessaging: () => ({
      chatGroups: [],
      broadcasts: [],
      unreadCounts: {},
      messages: [],
      loadConversation,
      sendMessage,
      sendBroadcast,
      getOrCreateConversation,
      createChatGroup,
      refreshMessages,
    }),
  };
});

vi.mock('@/stores/useHarvestStore', () => ({
  useHarvestStore: () => ({
    crew: [{ id: 'u2', name: 'Bob' }],
    teamLeaders: [{ id: 'u3', name: 'Charlie' }],
  }),
}));

vi.mock('../../services/simple-messaging.service', () => ({
  simpleMessagingService: {
    getUsers: vi.fn().mockResolvedValue([]),
    getDirectory: vi.fn().mockResolvedValue({ contacts: [], names: {} }),
    subscribeToConversation: vi.fn().mockReturnValue(vi.fn()),
    sendMessage: vi.fn().mockResolvedValue({ error: null }),
    createDirectChat: vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null }),
    createGroupChat: vi.fn().mockResolvedValue({ data: { id: 'c2' }, error: null }),
    sendBroadcast: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock('./messaging/MessagingSidebar', () => ({
  default: () => <div data-testid="messaging-sidebar">Sidebar</div>,
}));
vi.mock('./messaging/ChatWindow', () => ({
  default: () => <div data-testid="chat-window">ChatWindow</div>,
}));
vi.mock('./messaging/NewChatModal', () => ({
  default: () => <div data-testid="new-chat-modal">NewChatModal</div>,
}));

import UnifiedMessagingView from './UnifiedMessagingView';

describe('UnifiedMessagingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders sidebar initially', () => {
    const { unmount } = render(<UnifiedMessagingView />);
    expect(screen.getByTestId('messaging-sidebar')).toBeTruthy();
    unmount();
  });
});
