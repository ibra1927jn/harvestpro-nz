import { messagingRepository } from '@/repositories/messaging.repository';
import type { ChatReactionPayload } from './types';

/**
 * Procesa items de sync tipo CHAT_REACTION: la reacción que se puso o quitó sin
 * red. Las dos operaciones se pueden repetir sin efecto (ON CONFLICT DO NOTHING /
 * borrar lo que ya no está). La validación la hace el despachador con
 * ChatReactionPayloadSchema (sync.schemas.ts): no importar zod aquí.
 */
export async function processChatReaction(payload: ChatReactionPayload): Promise<void> {
  try {
    if (payload.op === 'add') {
      await messagingRepository.addReaction(payload.message_id, payload.emoji);
    } else {
      await messagingRepository.removeReaction(payload.message_id, payload.user_id, payload.emoji);
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // El mensaje se borró mientras tanto: la reacción ya no tiene a dónde ir
    if (payload.op === 'add' && err?.code === '23503') return;
    throw new Error(`Chat reaction not saved: ${err?.message ?? String(e)}`);
  }
}
