import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { activateOnKey, buttonLike } from './pressable';

describe('keyboard activation helpers', () => {
  it('buttonLike exposes a focusable named button that runs on Enter and Space', () => {
    const go = vi.fn();
    render(<div {...buttonLike(go, 'Open profile')}>TL</div>);
    const el = screen.getByRole('button', { name: 'Open profile' });
    expect(el).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    fireEvent.keyDown(el, { key: 'a' });
    expect(go).toHaveBeenCalledTimes(2);
  });

  it('activateOnKey ignores keys pressed on inner controls', () => {
    const go = vi.fn();
    render(
      <div tabIndex={0} data-testid="card" onKeyDown={activateOnKey(go)}>
        <button>Delete</button>
      </div>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key: 'Enter' });
    expect(go).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('card'), { key: 'Enter' });
    expect(go).toHaveBeenCalledTimes(1);
  });
});
