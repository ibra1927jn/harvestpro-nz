---
name: new-edge-function
description: Crea una nueva Supabase Edge Function para harvestpro-nz siguiendo el patron de seguridad del repo (requireRole, checkRateLimit, validacion Zod, CORS allowlist desde _shared/security.ts). Invocar con /new-edge-function <nombre>.
disable-model-invocation: true
---

Crea una nueva Edge Function en `supabase/functions/<nombre>/index.ts` siguiendo
EXACTAMENTE el patron de las funciones existentes. Nombre/proposito: $ARGUMENTS

Antes de escribir, lee una funcion existente como plantilla (p.ej.
`supabase/functions/record-bucket/index.ts`) y `_shared/security.ts`.

Estructura obligatoria del `index.ts`:
1. `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'`
2. Importa desde `../_shared/security.ts` lo que necesites:
   `handlePreflight`, `requireRole`, `checkRateLimit`, `errorResponse`,
   `jsonResponse`, y el schema Zod de entrada.
3. Comentario de cabecera en espanol explicando el proposito y por que es
   server-side (que ataque previene).
4. Dentro de `serve(async (req) => { ... })`:
   - `const preflight = handlePreflight(req); if (preflight) return preflight`
   - `const origin = req.headers.get('Origin')`
   - `try { ... } catch (e) { return errorResponse(e, origin, '<contexto>') }`
   - `const { user, supabase } = await requireRole(req, [<roles>])` — elige los
     roles minimos necesarios (principio de menor privilegio).
   - `checkRateLimit(user.id, { maxRequests, windowMs })` con limites sensatos.
   - Soporte de `_warmup` si aplica (retorno temprano para keep-alive).
   - Valida el body con un schema Zod (`Schema.parse(body)`); si el schema no
     existe en `_shared/security.ts`, anadelo alli siguiendo el patron.
   - Respuestas siempre con `jsonResponse(data, origin, status)`.

Reglas:
- NUNCA uses CORS `*`: el allowlist esta en `_shared/security.ts`.
- NUNCA la funcion como unica capa de defensa: la tabla debe tener RLS coherente.
- TS strict, sin `any`.

Al terminar, pasa el codigo por el subagente `security-reviewer`.
