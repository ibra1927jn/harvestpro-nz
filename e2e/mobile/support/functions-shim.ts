/**
 * functions-shim.ts — sirve las Edge Functions reales con Deno en un solo puerto.
 *
 * Solo para E2E cuando el contenedor edge_runtime local no puede arrancar los
 * workers (p. ej. no descarga deno.land por el proxy). Mismo código de
 * supabase/functions, misma BD; Playwright redirige /functions/v1/<name> aquí.
 *
 * deno run --allow-all --import-map=e2e/mobile/support/shim-import-map.json \
 *   e2e/mobile/support/functions-shim.ts <port> <fn1> <fn2> ...
 */
type Handler = (req: Request) => Response | Promise<Response>;

const g = globalThis as unknown as {
  __shimHandlers: Map<string, Handler>;
  __shimCurrent: string;
};
g.__shimHandlers = new Map();

const [portArg, ...names] = Deno.args;
const root = new URL('../../../supabase/functions/', import.meta.url);

// Importa cada función en orden: su llamada a serve() registra el handler
for (const name of names) {
  g.__shimCurrent = name;
  await import(new URL(`${name}/index.ts`, root).href);
  if (!g.__shimHandlers.has(name)) console.error(`[shim] ${name} did not register a handler`);
}

Deno.serve({ port: Number(portArg), hostname: '127.0.0.1' }, req => {
  const url = new URL(req.url);
  const name = url.pathname.replace(/^\/(functions\/v1\/)?/, '').split('/')[0];
  const h = g.__shimHandlers.get(name);
  if (!h) return new Response(`unknown function ${name}`, { status: 404 });
  return h(req);
});
// eslint-disable-next-line no-console -- script de Deno: el arranque se anuncia por consola
console.log(`[shim] serving ${names.join(', ')} on ${portArg}`);
