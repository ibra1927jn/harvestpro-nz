---
name: verify
description: Definition of done de harvestpro-nz. Usar SIEMPRE al terminar un cambio de codigo (services, components, hooks, schemas, repositories) antes de commit/push, o cuando el usuario pida "verifica", "comprueba que funciona" o "esta listo". Corre lint, tests y build mostrando evidencia real.
---

# Verify — verification loop de harvestpro-nz

Objetivo: cerrar el loop de verificacion tu mismo antes de dar un cambio por
terminado. No afirmar "esta hecho": ejecutar los checks y mostrar la **evidencia**
(output real, comando + resultado). Si algo falla, arreglar la causa raiz e iterar
hasta que pase — no suprimir el error.

## Secuencia (definition of done)

Ejecutar en este orden y parar en el primer fallo real:

1. **Lint** — `npm run lint`
   - ESLint con `--max-warnings 0`: cualquier warning es fallo.
   - Autofix disponible: `npm run lint:fix`.
2. **Tests** — `npm test` (o dirigido, ver abajo)
   - Vitest, jsdom, `fake-indexeddb`, pool=forks. Heap ya configurado (4GB).
   - Preferir tests dirigidos durante iteracion: `npx vitest run <ruta>`.
3. **Build** — `npm run build`
   - Es `tsc && vite build`: valida tipos (strict, sin `any`) y bundle.

Al terminar, reportar: comando corrido + resultado (pass/fail) + numero de tests.
Mostrar el output relevante, no solo "todo verde".

## Cuando usar cada nivel
- Cambio pequeno y local -> lint + test dirigido del archivo tocado.
- Cambio que cruza capas (service + hook + component) -> secuencia completa.
- Antes de `git push` -> secuencia completa siempre.

## Gotchas (quirks reales de este repo)
- **Env obligatorio para tests/build**: `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY` deben existir (placeholders valen). Ya los fija
  `.claude/settings.json` (`env`) y el hook `session-start.sh`. Si ves errores de
  validacion de env al arrancar Vite/Vitest, es que faltan.
- **Heap**: los scripts `test`/`test:coverage` ya suben el heap a 4GB via
  `cross-env`. Para pasos pesados (build/coverage completo) el harness fija
  `NODE_OPTIONS=--max-old-space-size=6144`.
- **`--max-warnings 0`**: el lint no tolera warnings. No dejar `eslint-disable`
  sin justificar (hay `--report-unused-disable-directives`).
- **TypeScript strict / sin `any`**: el build (`tsc`) es parte del check; un tipo
  mal puesto rompe aqui aunque los tests pasen.
- **Entorno CI vs local**: `CLAUDE.md` documenta que ~14 test files pueden fallar
  por entorno CI. Si un fallo es claramente de entorno (no de tu cambio),
  **documentarlo explicitamente** en el reporte — nunca ocultarlo ni asumir que
  tu cambio lo causo sin verificar.
- **Pre-commit**: `.husky/pre-commit` corre `npm run lint` (no tests). El build y
  los tests son responsabilidad de este skill / de CI.

## Segunda opinion (opcional, para cambios grandes)
Tras pasar la secuencia, para cambios de riesgo se puede pedir una review
adversarial en contexto fresco con `/code-review`, que revisa el diff en un
subagente y devuelve hallazgos de correctitud.
