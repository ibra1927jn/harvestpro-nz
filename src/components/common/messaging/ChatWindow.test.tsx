/**
 * ChatWindow — Messaging chat tests
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const selectedChat = {
  id: 'c1',
  name: 'Team Alpha',
  type: 'group' as const,
  members: ['u1', 'u2'],
  lastMessage: 'Hello',
  lastMessageAt: new Date().toISOString(),
};

const messages: any[] = [
  {
    id: 'm1',
    chat_id: 'c1',
    sender_id: 'u1',
    content: 'Hello everyone!',
    created_at: new Date().toISOString(),
    type: 'text',
    priority: 'normal',
    read_by: [],
  },
  {
    id: 'm2',
    chat_id: 'c1',
    sender_id: 'u2',
    content: 'Hi there!',
    created_at: new Date().toISOString(),
    type: 'text',
    priority: 'normal',
    read_by: [],
  },
];

const userNameMap = { u1: 'Alice', u2: 'Bob' };

import ChatWindow from './ChatWindow';

describe('ChatWindow', () => {
  const onSend = vi.fn();
  const onBack = vi.fn();

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = function () {};
  });

  it('renders chat name', () => {
    render(
      <ChatWindow
        selectedChat={selectedChat}
        messages={messages}
        appUserId="u1"
        userNameMap={userNameMap}
        isSending={false}
        onSend={onSend}
        onBack={onBack}
        isManager={true}
      />
    );
    expect(screen.getByText('Team Alpha')).toBeTruthy();
  });

  it('renders messages', () => {
    render(
      <ChatWindow
        selectedChat={selectedChat}
        messages={messages}
        appUserId="u1"
        userNameMap={userNameMap}
        isSending={false}
        onSend={onSend}
        onBack={onBack}
        isManager={true}
      />
    );
    expect(screen.getByText('Hello everyone!')).toBeTruthy();
    expect(screen.getByText('Hi there!')).toBeTruthy();
  });

  it('renders send input and calls onSend', () => {
    render(
      <ChatWindow
        selectedChat={selectedChat}
        messages={messages}
        appUserId="u1"
        userNameMap={userNameMap}
        isSending={false}
        onSend={onSend}
        onBack={onBack}
        isManager={true}
      />
    );
    const input = screen.getByPlaceholderText(/Type a message/i);
    fireEvent.change(input, { target: { value: 'New message' } });

    const _sendButton = screen.getByRole('button', { name: /send|submit/i }); // Usually an icon button
    // Just trigger form submit if possible, or looking for the send icon button
    // For simplicity, we can fire a keydown event for Enter
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('New message');
  });

  it('calls onBack when back button is clicked', () => {
    render(
      <ChatWindow
        selectedChat={selectedChat}
        messages={messages}
        appUserId="u1"
        userNameMap={userNameMap}
        isSending={false}
        onSend={onSend}
        onBack={onBack}
        isManager={true}
      />
    );
    const backButton = screen.getByText('arrow_back');
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalled();
  });

  it('marks own messages that did not reach the server: pending, or "Not sent" with Retry', () => {
    const onRetry = vi.fn();
    const now = new Date().toISOString();
    render(
      <ChatWindow
        selectedChat={selectedChat}
        messages={[
          { id: 'ok', sender_id: 'u1', content: 'sent one', created_at: now, priority: 'normal', read_by: [] },
          { id: 'wait', sender_id: 'u1', content: 'no signal', created_at: now, priority: 'normal', read_by: [], delivery: 'pending' },
          { id: 'bad', sender_id: 'u1', content: 'rejected one', created_at: now, priority: 'normal', read_by: [], delivery: 'failed', failure_reason: 'row-level security' },
        ]}
        appUserId="u1"
        userNameMap={userNameMap}
        isSending={false}
        onSend={onSend}
        onRetry={onRetry}
        onBack={onBack}
        isManager={true}
      />
    );
    // Antes los tres se veían igual ("done_all", como entregados)
    expect(screen.getAllByText('done_all')).toHaveLength(1);
    expect(screen.getByLabelText('Waiting to send')).toBeTruthy();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Not sent');
    expect(alert.getAttribute('title')).toBe('row-level security');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('bad');
  });
});
