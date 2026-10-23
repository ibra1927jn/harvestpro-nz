import { binRepository } from '@/repositories/bin.repository';
import type { BinPayload } from './types';

/**
 * Procesa items de sync tipo BIN (runner sin cobertura):
 * - register: alta del bin escaneado con el id generado en el móvil; si un
 *   intento anterior ya llegó (23505 en la clave), no es un error.
 * - status: cambio de estado con la hora del móvil (filled_at al llenarse).
 *
 * La validación del payload la hace el despachador (BinPayloadSchema, cargado
 * con import()): no importar zod aquí, este módulo va en el bundle inicial.
 */
export async function processBin(payload: BinPayload): Promise<void> {
  if (payload.action === 'register') {
    try {
      await binRepository.insert({
        id: payload.bin_id,
        orchard_id: payload.orchard_id as string,
        bin_code: payload.bin_code as string,
        status: payload.status ?? 'partial',
      });
    } catch (e) {
      // bins solo tiene única la clave (id): duplicado = ya dado de alta
      if ((e as { code?: string })?.code === '23505') return;
      throw e;
    }
    return;
  }
  await binRepository.updateStatus(payload.bin_id, payload.status as string, payload.filled_at ?? null);
}
