/**
 * useDialogA11y — comportamiento de teclado de un diálogo modal (WCAG 2.1.2, 2.4.3):
 * - al abrir, el foco entra en el diálogo (primer control, o el propio diálogo)
 * - Tab / Shift+Tab no salen del diálogo
 * - Escape cierra (solo el diálogo de más arriba si hay varios abiertos)
 * - al cerrar, el foco vuelve al control que lo abrió
 */
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

// Diálogos abiertos: Escape y el trap solo actúan en el de más arriba
interface Entry {
  ref: RefObject<HTMLElement | null>;
}
const stack: Entry[] = [];

/** El de más arriba: no contiene otro diálogo abierto y no se abrió otro después (salvo ancestros). */
function isTopmost(entry: Entry): boolean {
  const el = entry.ref.current;
  if (!el) return false;
  if (stack.some(o => o !== entry && o.ref.current && el.contains(o.ref.current))) return false;
  const later = stack.slice(stack.indexOf(entry) + 1);
  return !later.some(o => o.ref.current && !o.ref.current.contains(el));
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => !el.closest('[aria-hidden="true"]') && el.getClientRects().length > 0
  );
}

export interface DialogA11yOptions {
  /** Llamado con Escape. Sin él, Escape no hace nada. */
  onClose?: () => void;
  /** false para diálogos que no se deben cerrar con Escape */
  closeOnEscape?: boolean;
  /** Desactiva el hook (p. ej. drawer cerrado que sigue montado) */
  enabled?: boolean;
}

export function useDialogA11y(ref: RefObject<HTMLElement | null>, options: DialogA11yOptions = {}): void {
  const { onClose, closeOnEscape = true, enabled = true } = options;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escapeRef = useRef(closeOnEscape);
  escapeRef.current = closeOnEscape;
  // El control que abrió el diálogo se toma en el render en que se abre: en el
  // effect ya puede tener el foco un hijo con autoFocus
  const openerRef = useRef<HTMLElement | null>(null);
  const wasEnabled = useRef(false);
  if (enabled && !wasEnabled.current && typeof document !== 'undefined') {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  wasEnabled.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { ref };
    stack.push(entry);
    const opener = openerRef.current;

    // Foco inicial: respeta autoFocus de un hijo; si no, primer control
    const root = ref.current;
    if (root && !root.contains(document.activeElement)) {
      const first = focusables(root)[0];
      if (first) first.focus();
      else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
        root.focus();
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(entry)) return;
      const el = ref.current;
      if (!el) return;
      if (e.key === 'Escape') {
        if (escapeRef.current && onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      // Devolver el foco al control que abrió el diálogo (si sigue en la página)
      if (opener && opener.isConnected) {
        setTimeout(() => {
          if (opener.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus();
        }, 0);
      }
    };
  }, [enabled, ref]);
}
