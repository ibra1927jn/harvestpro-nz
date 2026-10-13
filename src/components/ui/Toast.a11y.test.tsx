import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Toast from './Toast';
import { subscribeAnnouncer, resetAnnouncerForTests, type Politeness } from '@/services/announcer';

describe('Toast accessibility', () => {
  beforeEach(() => resetAnnouncerForTests());

  it('announces the richer screen-reader text when given, politely for success', () => {
    const heard: [string, Politeness][] = [];
    const off = subscribeAnnouncer((m, p) => heard.push([m, p]));
    render(<Toast message="Saved 1 Bucket(s)" announcement="Bucket saved for Ana." type="success" onClose={() => {}} />);
    off();
    expect(heard).toEqual([['Bucket saved for Ana.', 'polite']]);
  });

  it('announces errors assertively with the visible text', () => {
    const heard: [string, Politeness][] = [];
    const off = subscribeAnnouncer((m, p) => heard.push([m, p]));
    render(<Toast message="No signal — check-in not saved." type="error" onClose={() => {}} />);
    off();
    expect(heard).toEqual([['No signal — check-in not saved.', 'assertive']]);
  });

  it('has a named dismiss button and hides the icon ligatures', () => {
    render(<Toast message="Saved" type="success" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeInTheDocument();
    expect(screen.queryByText('check_circle')).toHaveAttribute('aria-hidden', 'true');
  });
});
