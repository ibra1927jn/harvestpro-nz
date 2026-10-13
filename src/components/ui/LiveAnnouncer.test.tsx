/**
 * LiveAnnouncer + announcer: los avisos llegan a regiones aria-live que ya
 * estaban en el DOM (las que TalkBack sí anuncia).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import LiveAnnouncer from './LiveAnnouncer';
import { announce, resetAnnouncerForTests } from '@/services/announcer';

async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 80));
  });
}

describe('LiveAnnouncer', () => {
  beforeEach(() => resetAnnouncerForTests());

  it('renders persistent polite and assertive regions before any message', () => {
    render(<LiveAnnouncer />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('puts polite messages in the status region and assertive ones in the alert region', async () => {
    render(<LiveAnnouncer />);
    act(() => announce('Bucket saved for Ana.'));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Bucket saved for Ana.');
    act(() => announce('No signal.', 'assertive'));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('No signal.');
    expect(screen.getByRole('status')).toHaveTextContent('Bucket saved for Ana.');
  });

  it('announces the same text only once when two components send it together', async () => {
    const seen: string[] = [];
    render(<LiveAnnouncer />);
    const { subscribeAnnouncer } = await import('@/services/announcer');
    const off = subscribeAnnouncer(m => seen.push(m));
    act(() => {
      announce('All scans synced.');
      announce('All scans synced.');
    });
    off();
    expect(seen).toEqual(['All scans synced.']);
  });

  it('ignores empty messages', () => {
    const seen: string[] = [];
    return import('@/services/announcer').then(({ subscribeAnnouncer }) => {
      const off = subscribeAnnouncer(m => seen.push(m));
      announce('   ');
      off();
      expect(seen).toEqual([]);
    });
  });
});
