/**
 * Smoke tests for SimpleChat component
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('../services/simple-messaging.service', () => ({
  simpleMessagingService: {
    getConversations: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    subscribeToMessages: vi.fn().mockReturnValue(vi.fn()),
    getUsers: vi.fn().mockResolvedValue([]),
    createDirectConversation: vi.fn(),
    createTeamConversation: vi.fn(),
  },
}));

vi.mock('@/utils/nzst', () => ({
  nowNZST: () => '2026-03-30T10:00:00Z',
}));

vi.mock('./NewChatModal', () => ({
  default: () => <div data-testid="new-chat-modal" />,
}));

import { SimpleChat } from './SimpleChat';

describe('SimpleChat', () => {
  it('renders the chat container', () => {
    const { container } = render(<SimpleChat userId="u1" userName="Manager" />);
    // toBeDefined() no podia fallar (null esta definido)
    expect(container.firstChild).not.toBeNull();
  });

});
