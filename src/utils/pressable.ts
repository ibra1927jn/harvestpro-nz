/**
 * Teclado para elementos clicables que no son <button> (tarjetas, avatares):
 * Enter o Espacio sobre el propio elemento ejecuta la acción, igual que un clic.
 */
import type React from 'react';

export function activateOnKey(action: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>): void => {
    // Solo si el foco está en el propio elemento (no en un botón o input de dentro)
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}

/** Props para un elemento no nativo que actúa como botón (sin hijos interactivos). */
export function buttonLike(action: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: action,
    onKeyDown: activateOnKey(action),
    ...(label ? { 'aria-label': label } : {}),
  };
}
