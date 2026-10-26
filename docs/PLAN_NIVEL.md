# Plan: poner HarvestPro a buen nivel

> Escrito el 2026-10-26, leyendo el código y la auditoría de botones del 2026-10-23
> (`docs/audits/2026-10-23-wiring-audit.md`, rama `docs/wiring-audit-2026-10-23`).
> Meta: pasar de un **6 sobre 10** como producto a un **9**, listo para un piloto con un huerto real.
> Nada de funciones nuevas fuera de este plan hasta terminarlo.

## Cómo se trabaja en este plan

- **Lee primero** `CLAUDE.md`, `SECURITY_RULES.md` y `ERRORES.md`.
- **Cambios grandes:** primero se plantean, se hacen en una rama aparte, se comprueba que funcionan
  (lint, `tsc`, tests, e2e y la app real con Supabase local) y entonces se fusionan a `main`.
  Es la regla que ya está en `CLAUDE.md` (ramas cortas, fusionadas en 1-2 días, nunca apiladas), y
  es la que se rompió del 19 al 24 de octubre: no volver a acumular.
- **Decisiones del producto:** las toma Ibra. Él recorre la app rol por rol y pantalla por pantalla y
  dice qué tiene que hacer cada una; si una tarea depende de una decisión que no está aquí, se le
  pregunta antes de construir.
- **Con Ibra, explicaciones simples.** Al cerrar cada fase, un resumen corto de lo conseguido.
- **El repo es público:** nada de datos reales de personas ni claves de verdad en el código.
- **"Hecho"** = verde en lint, `tsc`, tests y e2e, y comprobado en la app real con el rol que toca.
  Cada arreglo lleva un test que falla sin él.

## Decisiones del dueño (no contradecir)

- La empresa tiene varios huertos; la plantilla es de la empresa y la nómina semanal de cada persona
  suma todos los huertos.
- El precio por cubeta vale por día, huerto y variedad; un cambio solo afecta a hoy.
- El manager no añade ni quita pickers de los equipos (eso es del team leader o de RRHH), no decide
  la hora de fin del turno, y sí elige huerto, filas y variedad. Manager y team leader ven el
  historial de filas de cada equipo.
- El team leader solo coge gente sin equipo; mover o soltar a alguien entre equipos lo hace RRHH. El
  TL registra los descansos y puede pedir ausencias para su equipo desde el móvil.
- `payroll_admin` aprueba y rechaza horas. El 8 % de holiday pay de los casuales lo pone el programa
  de nóminas (PaySauce/Xero), no HarvestPro.
- 2FA exigido también en el servidor (con interruptor para el PC de desarrollo).
- Invitar usuarios: admin y RRHH.
- Logística es UNA sola página.
- Idiomas: solo inglés, español y francés.
- Las funciones a medias del chat se terminan, no se quitan.
- Fuera de alcance por ahora: IA con Gemini (se quita), planificación de rutas en logística.
- Sin Supabase Cloud ni Hetzner: se trabaja con Supabase local (Docker).

## Fase 0 — Ordenar (lo primero, antes de tocar nada más)

`main` no recibe nada desde el 2026-10-19. El trabajo del 22 al 24 está en ramas, y la más completa
es `review/combined-2026-10-24b` (160 commits que `main` no tiene). Hay 108 ramas.

- [x] Comprobar `review/combined-2026-10-24b` entera: `npm run lint`, `npm run build`, `npm test`,
      e2e. Arreglar lo que falle. *(2026-10-27: integrada en la rama `integracion/fase-0`; en local
      lint, `tsc`, build, los guards de tests y los tests de lo tocado; la suite entera, las Edge
      Functions, el e2e móvil y "empresa desde cero" contra un Supabase real, en la CI del PR #90.)*
- [ ] Recorrer la app real con cada rol (Ibra, antes o justo después de fusionar).
- [x] Repasar lo que queda fuera de ella y decidir (`docs/audits/2026-10-27-inventario-ramas.md`):
  - `docs/manager-review-2026-10-21` (6 commits de revisiones por rol): fusionada en `integracion/fase-0`.
  - `wip/runner-verify` y `wip/team-leader-verify`: ya estaban hechas en C con otro código; no se
    meten, se pueden borrar.
  - `docs/wiring-audit-2026-10-23`: fusionada en `integracion/fase-0`.
  - Los 4 arreglos de seguridad que faltaban (datos personales a Sentry/PostHog, cerrar sesión,
    lectura de `harvest_settings`, fotos de QC por huerto): rama `fix/inventario-seguridad`,
    fusionada en `integracion/fase-0`. Las otras tareas de la clase B siguen apuntadas en el inventario.
- [ ] Fusionar a `main` con un PR y CI en verde. *(PR #90 abierto desde `integracion/fase-0`;
      falta que Ibra lo revise y lo fusione.)*
- [ ] Las ramas de abril (`fix/*-2026-04-22`, `improve/heartbeat-*`, `audit/*`, `lab/*`,
      `archive/2026-04`...): comprobar POR CONTENIDO que su arreglo ya está en `main` (muchas se
      rehicieron en octubre con otro código, por eso git las ve sin fusionar). Lo que falte, se
      apunta como tarea; luego se borran. Antes de borrar, enseñar la lista a Ibra.
      *(Comprobado por contenido: lista de borrado y tareas al final del inventario. Falta que Ibra
      la apruebe; no se ha borrado ninguna rama.)*
- [x] Poner al día `PROGRESS.md` (es de abril) y `README.md`. Quitar pendientes que ya no aplican
      (PR #6, desplegar `calculate-payroll` en la nube).
- **Hecho cuando:** `main` tiene todo el trabajo, CI en verde, y quedan solo las ramas en uso.

## Fase 1 — Volver a pasar la auditoría sobre `main`

Muchos puntos de la auditoría del 23 ya se arreglaron en las ramas (usuario desactivado bloqueado,
corregir una hoja quita la aprobación, precios por día, invitaciones, cola sin red del pase de lista,
presencia sin horas, tramos de más de 14 h...). Antes de arreglar nada más, saber qué queda.

- [ ] Repetir la auditoría en `main`: los controles por código y el barrido de la app real con cada
      rol, más los 16 flujos entre roles con dos sesiones abiertas.
- [ ] Una tabla con cada punto de la auditoría (A1-A5, B1-B10, C, D, E, F, G): arreglado / falta.
- **Hecho cuando:** está la lista de lo que falta de verdad, y es la que guía las fases 2 a 5.

## Fase 2 — Seguridad y dinero

Todo lo que quede de la sección A, primero que nada.
- [ ] Cada regla de acceso (RLS) con su test en `supabase/tests/security`: quién lee y quién
      escribe cada tabla, según las decisiones de arriba.
- [ ] Revisar las migraciones que aún tengan `USING (true)` y confirmar que una posterior las cierra.
- [ ] Nómina: ninguna hora se paga sin revisar; cada cálculo con su test contra las reglas de NZ
      (salario mínimo por fecha, festivos 1,5×, días alternativos, KiwiSaver).

## Fase 3 — Que los roles se hablen

Objetivo: los 16 flujos de la auditoría en vivo (hoy 3 perfectos, 9 a medias y 4 rotos).
- [ ] Nómina aprueba o rechaza → lo ven TL y manager.
- [ ] QC rechaza → aviso al TL y al manager; el TL ve las inspecciones de su equipo.
- [ ] Transporte: el runner ve en vivo si se lo asignaron o completaron.
- [ ] Avisos del manager: elegir destinatarios y que la campana cuente.
- [ ] Ausencias aprobadas: salen en el pase de lista y en Teams, y no cuentan como falta.
- [ ] Cambios de precio y presencia sin recargar.
- [ ] Notificaciones push funcionando con la app cerrada (registro del dispositivo y envío).

## Fase 4 — Un cliente nuevo desde cero

Hoy temporada, bloques, filas, flota e invitaciones solo se llenan con seeds o SQL.
- [ ] Pantallas para crear la empresa, huertos, temporada, bloques y filas, flota y bins, e invitar
      gente (admin y RRHH). Comprobar qué cubre ya `feat/company-setup-from-zero`.
- [ ] Prueba: con la base vacía, montar un huerto entero desde la app sin tocar SQL, y hacer un día
      de cosecha completo con todos los roles.

## Fase 5 — Sin cobertura, maquetas y detalles

- [ ] Sin red: pase de lista, bins del runner, foto de QC y chat. Probarlo en un Android real
      (`npx cap sync && npx cap run android`), no solo en el navegador.
- [ ] Maquetas que se terminan: adjuntos, notas de voz e info del chat; "Generate PDF" del informe
      semanal; la nota de calidad de cada cubeta; hora de inicio y fila al dar de alta un picker;
      historial de exportaciones de nómina en el servidor; confirmación antes de borrar o cancelar.
- [ ] Tablas muertas (`messages`, `quality_inspections`, `wage_rates`...): borrarlas o usarlas, y
      arreglar la vista `pickers_performance_today`.
- [ ] Visual: confirmación en cada guardado, el panel de notificaciones por encima, títulos legibles
      en modo oscuro, mensajes que no se contradicen.

## Fase 6 — Examen final

- [ ] Repetir la auditoría completa. Objetivo: 16 de 16 flujos en vivo, 0 botones rotos, 0 maquetas.
- [ ] Prueba de carga de una temporada (`perf/season-load-sim`) y la prueba de caos sin red.
- [ ] Un día de cosecha simulado con todos los roles a la vez, de principio a fin, con la nómina de
      esa semana revisada a mano.
- **Hecho cuando:** todo eso en verde. Entonces está listo para hablar de un piloto.
