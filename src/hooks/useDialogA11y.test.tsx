/**
 * useDialogA11y: foco dentro al abrir, Tab atrapado, Escape cierra (solo el
 * diálogo de arriba) y el foco vuelve al botón que lo abrió.
 */
import React, { useRef, useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDialogA11y } from './useDialogA11y';

function Dialog({ name, onClose, children }: { name: string; onClose: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(ref, { onClose });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={name}>
      <button onClick={onClose}>Close {name}</button>
      <button>Middle {name}</button>
      <button>Last {name}</button>
      {children}
    </div>
  );
}

function Harness({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(nested);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Outside</button>
      {open && (
        <Dialog name="outer" onClose={() => setOpen(false)}>
          {inner && <Dialog name="inner" onClose={() => setInner(false)} />}
        </Dialog>
      )}
    </div>
  );
}

// jsdom no calcula layout: getClientRects() vacío haría invisibles a todos
Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value() {
    return [{ width: 1, height: 1 }];
  },
});

describe('useDialogA11y', () => {
  it('moves focus into the dialog on open', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Close outer' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const last = screen.getByRole('button', { name: 'Last outer' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close outer' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns focus to the opener even when a child input has autoFocus', async () => {
    function AutoFocusHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open search</button>
          {open && (
            <Dialog name="search" onClose={() => setOpen(false)}>
              <input aria-label="Search" autoFocus />
            </Dialog>
          )}
        </div>
      );
    }
    render(<AutoFocusHarness />);
    const opener = screen.getByRole('button', { name: 'Open search' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Escape only closes the topmost dialog', () => {
    render(<Harness nested />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'outer' })).toBeInTheDocument();
  });
});
