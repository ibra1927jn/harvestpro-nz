# PROGRESS.md — Estado del proyecto

> Al día el 2026-10-27. Corto a propósito: el plan en curso es `docs/PLAN_NIVEL.md` (qué toca y en
> qué orden) y el detalle de cada cambio está en `CHANGELOG.md` y en la historia de git.
> El diario de enero a abril que había aquí está en la historia de git de este fichero.

## Dónde estamos

- Sin usuarios reales todavía. Una instalación = una empresa con varios huertos. Entorno: Supabase
  local en Docker + `npm run dev` (los deploys a Hetzner y Vercel se retiraron el 2026-10-10).
- `main` se quedó en el 2026-10-19. El trabajo del 19 al 27 de octubre entra con el PR de
  integración de la rama `integracion/fase-0` (Fase 0 del plan). Hasta que Ibra lo revise y lo
  fusione, `main` no tiene nada de lo de abajo.

## Hecho (19 – 27 de octubre de 2026)

- **Revisión por roles** (manager, team leader, runner, QC, RRHH) y sus arreglos: mapa táctico del
  team leader, "Mis horas" y almacén del runner, QC con seis criterios, Agenda de RRHH, contrato
  firmado en PDF, "Mi cuenta" para todos los roles.
- **Precio por cubeta por día, huerto y variedad** (`piece_rates`): cada cubeta se paga al precio de
  su día; nómina, cierre de semana, informes y tendencias lo usan.
- **Fichajes:** pase de lista y descansos sin red (cola `ATTENDANCE`), hora del servidor con el
  desfase del móvil corregido, tramos olvidados topados a 14 h, días cerrados bloqueados, presencia
  sin horas para runner/QC/logística (`presence_today`).
- **Nómina:** corregir una hoja quita la aprobación, no se aprueban turnos abiertos, los rechazos
  llevan motivo, paneles en vivo.
- **Chat y avisos:** adjuntos, notas de voz, reacciones, respuestas, "Escribiendo…", canal privado
  por conversación; notificaciones push por bandeja (`notification_outbox` → `send-push`) sin el texto
  del mensaje.
- **Estructura del huerto:** temporadas, bloques y filas desde la app; el asistente de huerto nuevo
  lo crea todo de una vez.
- **Seguridad:** usuarios desactivados fuera de Auth y de las lecturas, el team leader solo toca su
  equipo, invitaciones con caducidad; y el 2026-10-27 (rama `fix/inventario-seguridad`): sin datos
  personales a Sentry/PostHog, cerrar sesión borra Cache Storage y `sessionStorage`, `harvest_settings`
  solo se lee del propio huerto, fotos de QC solo en la carpeta del propio huerto.
- **Rendimiento y datos:** prueba de carga de una temporada (`docs/audits/2026-10-21-load-test.md`),
  lecturas paginadas de más de 1000 filas, copias de seguridad locales diarias con restauración
  probada (`docs/backups-local.md`).
- **Idiomas:** inglés, español y francés.
- **Documentos:** auditoría de botones y flujos (`docs/audits/2026-10-23-wiring-audit.md`), revisión
  del manager y por roles (`docs/audits/2026-10-21-manager-review.md`), inventario de ramas
  (`docs/audits/2026-10-27-inventario-ramas.md`) y el plan (`docs/PLAN_NIVEL.md`).

## Pendiente

- **Ibra:** revisar y fusionar el PR de `integracion/fase-0` a `main`.
- **Ibra:** aprobar la lista de ramas que se pueden borrar (final de
  `docs/audits/2026-10-27-inventario-ramas.md`). No se ha borrado ninguna.
- **Del inventario (clase B), sin hacer:** decidir si `signOut` cierra todas las sesiones (`scope: 'global'`); decidir si
  la app guarda los días alternativos (Holidays Act s.60) o los lleva el programa de nóminas;
  limpiar `baseRepository.delete`.
- **Después:** Fase 1 del plan (repetir la auditoría sobre `main`) y siguientes.

## Dónde mirar

| Para | Fichero |
| --- | --- |
| Qué toca ahora | `docs/PLAN_NIVEL.md` |
| Reglas de trabajo y arquitectura | `CLAUDE.md`, `SECURITY_RULES.md`, `ERRORES.md` |
| Auditorías | `docs/audits/` (la externa del 16, carga del 21, revisión por roles del 21, botones del 23, ramas del 27) |
| Qué cambió | `CHANGELOG.md` |
