/**
 * Sustituto de std/http/server.ts para functions-shim: en vez de abrir un
 * puerto, registra el handler bajo el nombre de la función que se importa.
 */
type Handler = (req: Request) => Response | Promise<Response>;

export function serve(handler: Handler): Promise<void> {
  const g = globalThis as unknown as {
    __shimHandlers: Map<string, Handler>;
    __shimCurrent: string;
  };
  g.__shimHandlers.set(g.__shimCurrent, handler);
  return Promise.resolve();
}
