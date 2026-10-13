/**
 * announcer — avisos para lectores de pantalla (TalkBack / VoiceOver).
 *
 * Las regiones aria-live tienen que existir ANTES de que cambie su texto: un
 * toast o banner que se monta ya con el mensaje no se anuncia de forma fiable.
 * <LiveAnnouncer /> se monta una vez en la raíz y este módulo le pasa los textos.
 */
export type Politeness = 'polite' | 'assertive';
type Listener = (message: string, politeness: Politeness) => void;

const listeners = new Set<Listener>();
// Mismo texto en menos de DEDUPE_MS: un solo anuncio (componentes montados dos veces)
const DEDUPE_MS = 1_000;
let last: { message: string; at: number } | null = null;

export function announce(message: string, politeness: Politeness = 'polite'): void {
  const text = message.trim();
  if (!text) return;
  const now = Date.now();
  if (last && last.message === text && now - last.at < DEDUPE_MS) return;
  last = { message: text, at: now };
  listeners.forEach(l => l(text, politeness));
}

export function subscribeAnnouncer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Solo tests: olvida el último mensaje (para el dedupe). */
export function resetAnnouncerForTests(): void {
  last = null;
}
