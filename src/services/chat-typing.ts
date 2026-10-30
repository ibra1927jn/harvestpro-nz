/**
 * «Escribiendo…» del chat: aviso efímero por el canal de la conversación
 * (Broadcast), nunca se escribe en la base.
 * - Quien escribe manda como mucho un aviso cada TYPING_THROTTLE_MS.
 * - Quien lo recibe lo enseña hasta TYPING_TIMEOUT_MS después del último aviso
 *   (o hasta que llega un mensaje de esa persona).
 */

export const TYPING_THROTTLE_MS = 3000;
export const TYPING_TIMEOUT_MS = 5000;

/** Lado de quien escribe: deja pasar un aviso cada TYPING_THROTTLE_MS */
export function createTypingSender(send: () => void, now: () => number = Date.now) {
    let last = Number.NEGATIVE_INFINITY;
    return {
        /** Cada cambio del texto. Vacío = no se avisa. */
        onInput(text: string): void {
            if (!text.trim()) return;
            const t = now();
            if (t - last < TYPING_THROTTLE_MS) return;
            last = t;
            send();
        },
        /** Al enviar: la próxima tecla vuelve a avisar */
        reset(): void {
            last = Number.NEGATIVE_INFINITY;
        },
    };
}

/** Lado de quien lee: quién está escribiendo ahora, con caducidad */
export function createTypingWatcher(onChange: (userIds: string[]) => void) {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const emit = () => onChange([...timers.keys()]);
    const drop = (userId: string): boolean => {
        const timer = timers.get(userId);
        if (timer === undefined) return false;
        clearTimeout(timer);
        timers.delete(userId);
        return true;
    };
    return {
        /** Llegó un aviso de esta persona */
        seen(userId: string): void {
            const wasThere = drop(userId);
            timers.set(userId, setTimeout(() => {
                timers.delete(userId);
                emit();
            }, TYPING_TIMEOUT_MS));
            if (!wasThere) emit();
        },
        /** Llegó su mensaje: ya no está escribiendo */
        stop(userId: string): void {
            if (drop(userId)) emit();
        },
        /** Al cambiar de conversación o cerrar */
        clear(): void {
            const had = timers.size > 0;
            for (const timer of timers.values()) clearTimeout(timer);
            timers.clear();
            if (had) emit();
        },
    };
}
