# Inventario de ramas — 2026-10-27

Fase 0 de `docs/PLAN_NIVEL.md`: para cada rama de GitHub, ¿su trabajo ya está en
`review/combined-2026-10-24b` (en este documento, **C**)?

- Se miraron **106 ramas** (todas menos C, `main` y `HEAD`). `main` está entera dentro de C.
- Se juzgó **por contenido**, no solo por la historia de git. Muchas ramas de abril se ven "sin fusionar"
  porque en octubre se rehízo el mismo arreglo con otro código. Para cada una se miró qué cambia y se buscó
  lo mismo en C (migraciones, funciones, constantes, configuración).
- **No se ha borrado ni cambiado ninguna rama.** La lista de borrado del final es una propuesta: **Ibra tiene
  que aprobarla** antes de borrar nada.

## Resumen

| Clase | Cuántas | Qué significa |
|---|---|---|
| A — Ya está en C | 90 | Se puede borrar: su trabajo está en C (igual o rehecho), o ya no aplica |
| B — Falta algo | 8 | Hay un arreglo que C no tiene; sale una tarea |
| C — Solo documentos | 7 | Solo auditorías o documentos; 2 hay que fusionarlas |
| D — Sin verificar / a medias | 1 | Trabajo que nadie ha comprobado con el código actual |

### Lo más importante

1. **Clave secreta en la historia pública (urgente, fuera del código).** El repo es público. Entre el
   2026-04-14 (commit `d5ce6e36`) y el 2026-10-16 (commit `470c544c`), el fichero `scripts/setup-db.cjs`
   llevaba escrita la **clave `service_role`** y la **contraseña de la base de datos** del proyecto de
   Supabase en la nube `bfglkiaauqxsddznucxf`. Hoy ya **no** están en los ficheros de C, pero **sí siguen en
   la historia** de C y de `main`: cualquiera puede verlas. Si ese proyecto de Supabase sigue existiendo,
   hay que **cambiar la clave `service_role` y la contraseña de Postgres** en el panel de Supabase (o borrar
   el proyecto si ya no se usa). Borrar la rama no arregla nada. Las demás claves que aparecen en C son las
   de prueba de Supabase local (`supabase-demo`) o falsas (`mock`, `placeholder`), y no son un problema.
2. **Datos personales a PostHog y Sentry (falta en C).** El arreglo de abril no se rehízo: C envía el
   **email** del usuario a PostHog (`analytics.identify` en `src/hooks/useAuthSession.ts`) y a Sentry
   (`setSentryUser`), manda el `picker_id` sin ocultar en los eventos de cubetas, fichajes y filas, y el
   `beforeSend` de Sentry no limpia emails, IRD ni cuentas bancarias de los mensajes de error.
3. **Cerrar sesión deja cosas (falta en C).** C cierra sesión solo en el dispositivo actual (el `signOut`
   no usa `scope: 'global'`) y no borra la caché del service worker (`supabase-api-cache`, respuestas de
   la API) ni `sessionStorage`. En una tablet compartida, la siguiente persona podría ver datos cacheados.
4. **Lectura de `harvest_settings` abierta (falta un trozo).** La escritura ya está cerrada en C
   (`20261013060000_security_hardening.sql`), pero siguen vivas dos políticas de LECTURA abiertas:
   `"Users can read settings"` (`USING (true)`) y `"settings_view_policy"` (`auth.uid() IS NOT NULL`). Así,
   cualquier usuario con sesión lee las tarifas de todos los huertos. Riesgo bajo (una instalación es una
   empresa), pero la regla dice "su huerto".
5. **Las dos ramas `wip/*` ya están hechas en C.** `wip/runner-verify` y `wip/team-leader-verify` se
   terminaron y entraron en C con otro código: no hay que verificarlas ni meterlas, se pueden borrar.

Confianza general: **alta** en las clases A y C (se leyó el código de C). En la clase B, alta en qué
falta. No se ejecutó nada (ni tests ni la app): las políticas de la base de datos se dedujeron leyendo las
migraciones en orden. Conviene confirmar el punto 4 en el Supabase local con
`SELECT policyname, qual FROM pg_policies WHERE tablename = 'harvest_settings';`.

## Clase A — Ya está en C

### A1. Ramas sin ningún commit propio fuera de C (63)

Todo su contenido ya está en C, por la historia de git. Las que dicen "ya estaba en `main`" se fusionaron
antes del 19 de octubre.

| Rama | Último commit | Evidencia |
|---|---|---|
| `chore/ci-gaps-and-cleanup` | 2026-10-24 | 0 commits fuera de C |
| `chore/locales-en-es-fr` | 2026-10-23 | 0 commits fuera de C |
| `docs/refresh-2026-10` | 2026-10-16 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/chat-and-offline` | 2026-10-23 | 0 commits fuera de C |
| `feat/chat-reactions-reply` | 2026-10-23 | 0 commits fuera de C |
| `feat/company-setup-from-zero` | 2026-10-24 | 0 commits fuera de C |
| `feat/daily-piece-rates` | 2026-10-23 | 0 commits fuera de C |
| `feat/export-unified-pay` | 2026-10-11 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/hr-block2` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/hr-review` | 2026-10-22 | 0 commits fuera de C |
| `feat/my-account` | 2026-10-22 | 0 commits fuera de C |
| `feat/owner-decisions` | 2026-10-14 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/pay-week-close` | 2026-10-12 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/people-single-source` | 2026-10-12 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/push-and-offline-rollcall` | 2026-10-23 | 0 commits fuera de C |
| `feat/role-comms` | 2026-10-23 | 0 commits fuera de C |
| `feat/shifts-and-varieties` | 2026-10-12 | 0 commits fuera de C (ya estaba en `main`) |
| `feat/unified-pay-calc` | 2026-10-11 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/admin-signup-block4` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/audit-harvest` | 2026-10-14 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/broken-screens` | 2026-10-23 | 0 commits fuera de C |
| `fix/local-dev-bootstrap` | 2026-10-10 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/manager-review` | 2026-10-22 | 0 commits fuera de C |
| `fix/messaging-block3` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/picker-team-rules` | 2026-10-16 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/pilot-blockers` | 2026-10-12 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/qc-logistics` | 2026-10-12 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/qc-review` | 2026-10-22 | 0 commits fuera de C |
| `fix/runner-review` | 2026-10-23 | 0 commits fuera de C |
| `fix/runner-review-int` | 2026-10-23 | 0 commits fuera de C |
| `fix/screens-unified-hours` | 2026-10-11 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/security-attendance` | 2026-10-23 | 0 commits propios fuera de C; solo un merge sin contenido |
| `fix/security-block5` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `fix/team-leader-review` | 2026-10-23 | 0 commits fuera de C |
| `fix/team-leader-review-int` | 2026-10-23 | 0 commits fuera de C |
| `fix/time-and-presence` | 2026-10-24 | 0 commits fuera de C |
| `improve/a11y-non-visual` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/data-loss-gaps` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/db-security-tests` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/edge-function-tests` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/god-files-2` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/god-files-cleanup` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/i18n-audit` | 2026-10-14 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/integration` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/lazy-locales` | 2026-10-14 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/mobile-e2e` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/offline-chaos` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/payroll-differential` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/perf-mobile` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/review-independent` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/round2` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/round3` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/round4` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/round5` | 2026-10-14 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/sync-split-bugs` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/test-mocks-fix` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `improve/test-quality-mutation` | 2026-10-13 | 0 commits fuera de C (ya estaba en `main`) |
| `integration/2026-10-22` | 2026-10-23 | 0 commits fuera de C |
| `perf/season-load-sim` | 2026-10-23 | 0 commits fuera de C |
| `review/combined-2026-10-24` | 2026-10-24 | 0 commits propios fuera de C; solo resuelve un conflicto en un test (`attendance_test.ts`) del que C tiene una versión más nueva |
| `staging/auto-2026-04-21` | 2026-04-21 | 0 commits fuera de C (ya estaba en `main`) |
| `test/ci-verification` | 2026-02-12 | 0 commits fuera de C (ya estaba en `main`) |
| `v15-fix-blockers` | 2026-04-17 | 0 commits fuera de C (ya estaba en `main`) |

### A2. Ramas con commits "fuera de C", pero cuyo contenido ya está en C o ya no aplica (27)

| Rama | Último commit | Evidencia en C |
|---|---|---|
| `fix/role-escalation-2026-04-22` | 2026-04-22 | Rehecho: el disparador `guard_user_changes` (`20261013060000_security_hardening.sql`, mejorado en `20261013109000_guard_user_changes_inactive.sql`) impide que nadie salvo admin cambie un rol ("Only an admin can change roles"); prueba en `supabase/tests/security/20_people.sql`. Confianza alta. |
| `fix/rls-close-remaining-tables-2026-04-22` | 2026-04-22 | Temporadas, bloques y filas: cerradas en `20261013060000_security_hardening.sql`. Las otras 7 tablas (`teams`, `break_logs`, `session_signatures`, `bucket_runners`, `tractor_fleet`, `performance_metrics`, `sync_queue`) no existen en el esquema de C. El test `01_catalog.sql` falla si queda una política de escritura abierta. Confianza alta. |
| `fix/kiwisaver-rate-2026-04-22` | 2026-04-22 | `src/constants/nz-law.ts`: `NZ_KIWISAVER_EMPLOYER_MIN = 0.035` y 3,5 % en la lista. El fichero `nz-tax-rates.ts` ya no existe: la app no calcula KiwiSaver, lo hace el programa de nóminas (decisión del 2026-10-16). |
| `fix/meal-break-paid-flag-2026-04-22` | 2026-04-22 | Resuelto de otra forma: solo se descuenta el descanso que anota el team leader (`20261014002000_meal_break_recorded_only.sql` y `PAY_RULES` en `pay-rules.ts`). Ya no hay descuento automático de 30 min, así que la opción "pagado / no pagado" no hace falta. |
| `fix/check-compliance-settings-table-2026-04-22` | 2026-04-22 | `supabase/functions/check-compliance/index.ts` lee `harvest_settings` (`piece_rate, min_wage_rate`) y aplica `Math.max(..., PAY_RULES.minWageFloor)`. Detalle menor: la tarifa de reserva sigue en 3,50 (solo se usa si un huerto no tiene tarifa). |
| `fix/provision-orchard-schema-2026-04-22` | 2026-04-22 | `supabase/functions/provision-orchard/index.ts` inserta en `harvest_settings`; `orchard_settings` no aparece en C. |
| `fix/remove-ghost-user-2026-04-22` | 2026-04-22 | Ninguna migración ni seed de C crea el usuario `00000000-…`. Solo lo crea `supabase/archive/fix_schema_divergence.sql`, que no se aplica. La base de la nube donde pudo existir ya no se usa. Opcional: borrar ese script viejo. |
| `lab/hp-infra-03-ci-secret-regex-false-positive` | 2026-04-20 | El mismo cambio está en C (`.github/workflows/security.yml`, con la nota HP-INFRA-03). |
| `lab/hp-sec-03-chats-rls-tighten` | 2026-04-20 | La tabla `chats` no existe en el esquema de C (el chat usa `conversations` y `chat_messages`). No aplica. |
| `lab/autonomous-2026-04-21` | 2026-04-21 | Arreglaba un test con una fecha fija; en C ese test ya no usa la fecha `2026-04-14`. |
| `test/repo-coverage-edge-fn-optimistic-2026-04-22` | 2026-04-22 | El mismo cambio ya está en C (`edge-functions.repository.test.ts`, `optimistic-lock.repository.test.ts`). |
| `test/coverage-boost-2026-04-19` | 2026-04-18 | Tests de ficheros que ya no existen (`pluralize.ts`, `avatarUrl.ts`, `nz-tax-rates.ts`). `time.test.ts` sí está en C. |
| `improve/heartbeat-2026-03-30` | 2026-03-30 | Limpieza de rutas de tests y tipos de marzo; un commit ya está en C y el resto toca código que se reescribió. |
| `improve/heartbeat-2026-04-06` | 2026-04-12 | Filtro de specs móviles de Playwright; C tiene ahora su propia suite móvil (`e2e/mobile`, `test:e2e:mobile`). |
| `improve/heartbeat-2026-04-12` | 2026-04-12 | Quitar imports de React sin usar. El parámetro `bucketRecords` que renombraba ahora sí se usa en C (`analytics.service.ts`). |
| `improve/heartbeat-2026-04-17` | 2026-04-18 | Festivos de NZ: `isPublicHoliday` y `NZ_PUBLIC_HOLIDAYS` están en `src/constants/nz-law.ts`. Doble diseño escritorio/móvil: `ResponsiveLayout` y `DesktopLayout`. El resto es limpieza de código que ya cambió. |
| `improve/heartbeat-2026-04-18` | 2026-04-18 | Misma historia que `fix/critical-audit-2026-04-19` (ver abajo). |
| `improve/heartbeat-2026-04-23` | 2026-04-23 | `safeUUID()` en vez de `Math.random()`: en C esos ficheros ya no usan `Math.random`. El otro commit es el mismo documento que `docs/research-and-audits-2026-04-23`. |
| `improve/test-coverage-2026-03-30` | 2026-03-30 | Tests parciales de marzo, sobre código que cambió; la configuración `pool: 'threads'` ya está en `vitest.config.ts`. |
| `fix/critical-audit-2026-04-19` | 2026-04-18 | 67 commits; 15 aplicados tal cual en C. Sus 3 arreglos críticos están rehechos: políticas abiertas (migraciones de octubre más el test `01_catalog.sql`), el fallo de `mpi-export` con `audit_log` (corregido, `src/services/mpi-export.service.ts`) y el 2FA en el servidor (`20261014000000_server_side_mfa.sql`). Días festivos y días alternativos: en `payroll-calc.ts`. Lo que "falta" son tests de componentes que ya no existen y dos documentos que ya están en `docs/archive/2026-04/`. |
| `audit/deep-review-2026-04-19` | 2026-04-18 | Subconjunto de `fix/critical-audit-2026-04-19`; el documento está en `docs/archive/2026-04/AUDIT_2026_04_19_DEEP_REVIEW.md`. |
| `archive/2026-04` | 2026-10-16 | Rama "museo" creada el 2026-10-16: un solo commit que une las puntas de las ramas viejas de abril para no perderlas. Su contenido es el de `main`. Ver la nota de la lista de borrado. |
| `feat/pilot-hardening` | 2026-02-10 | Arreglos de febrero sobre la estructura antigua (carpetas `components/`, `context/` sin `src/`). Todo ese código se reescribió; nada que traer. Confianza media-alta. |
| `harvest-fixes` | 2026-02-06 | Febrero, estructura antigua (`services/geminiService.ts`, `context/HarvestContext.tsx`); C ya no usa Gemini ni `HarvestContext`. |
| `phase-1-refactor-and-cleanup-16646578613640258155` | 2026-01-30 | Las fases 1-3 de enero (Dexie, mapas, partir `HarvestContext`) ya están, rehechas, en C. |
| `wip/runner-verify` | 2026-10-22 | Terminado en C: `MyTimesheetView`, `WarehouseView`, `runnersNow` y sus tests son idénticos en C; `requestPickup` y `WAREHOUSE_ZONE` están en `useRunnerWarehouse.ts`; los textos nuevos están en en/es/fr. Lo único distinto: idiomas que C ya quitó (hi, mi, sm, tl, to) y el subconjunto de iconos, que en C es más nuevo. |
| `wip/team-leader-verify` | 2026-10-22 | Terminado en C con otro código: la regla de alcance (`assertCanTouchPicker` en `_shared/attendance-access.ts`, la misma que la política "Manage attendance"), el motivo de 5 a 500 caracteres en `_shared/security.ts` y los tests de alcance de equipo en `supabase/functions/tests/attendance_test.ts`. |

## Clase B — Falta algo

| Rama | Último commit | Qué falta en C y dónde iría |
|---|---|---|
| `fix/remove-hardcoded-secrets-2026-04-22` | 2026-04-22 | (1) **Fuera del código:** cambiar la clave `service_role` y la contraseña de Postgres del proyecto `bfglkiaauqxsddznucxf`, o borrar el proyecto (ver "Lo más importante", punto 1). (2) `scripts/seed-users.cjs` sigue con valores de reserva: el proyecto `mcbtyaebetzvzvnxydpy` y un texto "PEGAR_AQUI…". No es un secreto, pero el script podría ejecutarse contra ese proyecto sin querer: exigir las variables de entorno o borrar el script si ya no se usa (los deploys a la nube se retiraron). (3) La revisión de secretos antes de cada commit (`.husky/pre-commit` solo hace `npm run lint`). Opcional; la CI ya revisa `src/`. |
| `fix/sentry-posthog-pii-redaction-2026-04-22` | 2026-04-22 | `src/hooks/useAuthSession.ts`: no mandar `email` a `analytics.identify` ni a `setSentryUser`. `src/config/analytics.ts`: no mandar `picker_id` en claro (usar un seudónimo o quitarlo) en `trackBucketScanned`, `trackCheckIn` y `trackRowAssignment`, y filtrar las claves con datos personales. `src/config/sentry.ts`: `beforeSend` y `beforeBreadcrumb` que limpien emails, IRD, cuentas bancarias y nombres; `setSentryUser` sin email. Con test. |
| `fix/signout-global-and-requirerole-db-2026-04-22` | 2026-04-22 | La mitad de `requireRole` ya está en C (lee rol e `is_active` de `public.users`). Falta: `supabase.auth.signOut({ scope: 'global' })` en `src/context/auth/authActions.ts` (`teardownSession`), para cerrar también las otras sesiones de esa cuenta. Antes, decidir si se quiere (cierra la sesión en todos los móviles de esa persona). |
| `fix/logout-clear-caches-2026-04-22` | 2026-04-22 | Al cerrar sesión, C borra Dexie y `localStorage` y recarga. Falta borrar la Cache Storage (sobre todo `supabase-api-cache`, que guarda respuestas de la API según `vite.config.ts`) y `sessionStorage`. Iría en `wipeLocalData()` (`src/context/auth/authActions.ts`). |
| `fix/harvest-settings-rls-wage-theft-2026-04-22` | 2026-04-22 | La escritura está cerrada en C. Falta una migración nueva que quite las lecturas abiertas `"Users can read settings"` (de `20260227_rls_hierarchy_tables.sql`) y `"settings_view_policy"` (de `2026030101_rls_consolidation.sql`), y deje solo "Read settings" (su huerto) y la de admin, más un caso en `supabase/tests/security/`. Ojo: antes, comprobar quién lee ajustes de otro huerto (el selector de huerto del admin, el `realtime`). |
| `fix/qc-photos-privacy-2026-04-22` | 2026-04-22 | En C el almacén es privado, con enlaces firmados (`useQcPhotoUrl`), y solo suben QC, manager y admin. Falta limitarlo **por huerto**: hoy un QC o manager de cualquier huerto puede ver o subir fotos en la carpeta de otro. Iría en una migración nueva y en `supabase/storage_policies.sql` (primera carpeta de la ruta = huerto de quien llama). Riesgo bajo mientras haya una empresa por instalación. |
| `fix/alt-holiday-cross-period-2026-04-22` | 2026-04-22 | C calcula los días alternativos (Holidays Act s.60) en cada cálculo de nómina (`_shared/payroll-calc.ts`) y los muestra, pero no los guarda. Si se suman varias ejecuciones o periodos que se solapan, se cuentan dos veces, y no hay forma de marcar uno como disfrutado. La rama creaba la tabla `alternative_holidays`. Decidir si se quiere ese registro o si lo lleva el programa de nóminas (como las vacaciones); si se quiere, migración nueva y cambio en `calculate-payroll`. |
| `fix/base-repository-soft-delete-2026-04-22` | 2026-04-22 | `src/repositories/baseRepository.ts` sigue con `delete(..., soft = true)` y el doble cast `as unknown as Partial<T>`, que la regla del proyecto prohíbe. Hoy nadie lo llama (no hay ningún `Repo.delete(`), así que no rompe nada. Tarea pequeña: borrado normal por defecto y `softDelete` aparte con tipo, o quitar el método. |

## Clase C — Solo documentos

| Rama | Último commit | Qué es y qué hacer |
|---|---|---|
| `docs/manager-review-2026-10-21` | 2026-10-21 | 6 commits, un fichero: `docs/audits/2026-10-21-manager-review.md` (revisión por roles y decisiones del dueño). **Fusionar.** No está en C. |
| `docs/wiring-audit-2026-10-23` | 2026-10-23 | `docs/audits/2026-10-23-wiring-audit.md` y `docs/audits/2026-10-23-wiring/` (auditoría por código y de la app real). **Fusionar.** `PLAN_NIVEL.md` y la migración `20261024030000_drop_dead_tables.sql` ya la citan, y no está en C. |
| `audit/harvestpro-2026-04` | 2026-04-20 | `AUDIT-harvestpro-2026-04.md`. Auditoría de abril, superada por las de octubre. No vale la pena fusionarla. |
| `audit/harvestpro-2026-04-round2` | 2026-04-21 | `AUDIT-harvestpro-2026-04-round2.md`. Igual que la anterior. No fusionar. |
| `audit/reports-2026-04-22` | 2026-04-22 | `audits/2026_04_22/` (14 informes). Es la auditoría de la que salieron las ramas `fix/*-2026-04-22`; lo que sigue faltando está en la clase B. No fusionar. |
| `docs/deploy-runbook-2026-04-19` | 2026-04-18 | `DEPLOYMENT_RUNBOOK.md` para Hetzner. Los deploys a Hetzner se retiraron el 2026-10-10. No fusionar. |
| `docs/research-and-audits-2026-04-23` | 2026-04-23 | `AUDIT_2026_04_23_DEEP/` e investigación externa (`docs/external/research/`: nóminas en NZ, piece rate, offline-first, software agrícola). No hace falta fusionarla. Si se quiere guardar la investigación, copiarla a `docs/archive/2026-04/`. Sigue accesible a través de `archive/2026-04`. |

Las ramas de documentos no tienen claves ni contraseñas (se revisó buscando patrones de claves).

## Clase D — Sin verificar / a medias

| Rama | Último commit | Qué cambia y qué riesgo tiene |
|---|---|---|
| `claude/vñaide-code-usage-kj089r` | 2026-07-08 | Herramientas para Claude Code, no código de la app: `.claude/` (ajustes, hooks que bloquean un push directo a `main`, subagentes revisores de seguridad y RLS, skills para migraciones nuevas y para verificar) y `tests/rls/` (tests de RLS contra un Postgres real). Nada de esto está en C. Hecho en julio sobre un código muy anterior: los hooks y skills pueden apuntar a comandos o rutas que ya no existen, y `tests/rls/` repite lo que ya hace `scripts/test-db-security.sh`. Decidir si se quiere; si sí, rehacerlo sobre C en vez de fusionar la rama. |

## Ramas que se pueden borrar

**Nada se ha borrado. Ibra tiene que aprobar esta lista antes.**

- Las **90 ramas de la clase A** (tablas A1 y A2).
- Las **2 ramas de documentos que se van a fusionar**, `docs/manager-review-2026-10-21` y
  `docs/wiring-audit-2026-10-23`, pero **solo después** de fusionarlas.
- Las otras 5 de la clase C (documentos de abril) también se pueden borrar: siguen guardadas dentro de
  `archive/2026-04`.

Nota sobre `archive/2026-04`: técnicamente es clase A, pero es la rama que guarda la historia de todas las
ramas de abril. **Recomendación:** borrar las ramas de abril sueltas y **conservar `archive/2026-04`**
como la única copia. Así la lista de ramas queda limpia y no se pierde nada.

Las ramas de la clase B también se pueden borrar **cuando su tarea esté hecha** (o apuntada): el arreglo
se va a rehacer sobre C, no a fusionar, y la rama vieja sigue guardada en `archive/2026-04`.

## Tareas que salen

Ordenadas por importancia:

1. **Cambiar las claves del proyecto Supabase `bfglkiaauqxsddznucxf`** (clave `service_role` y contraseña
   de Postgres), o borrar ese proyecto si ya no se usa. Lo tiene que hacer Ibra en el panel de Supabase.
   El repo es público y las claves están en la historia de git.
2. **Datos personales a Sentry y PostHog:** quitar el email, ocultar `picker_id` y limpiar los errores
   (`useAuthSession.ts`, `config/analytics.ts`, `config/sentry.ts`).
3. **Cerrar sesión de verdad:** borrar la Cache Storage y `sessionStorage` en `wipeLocalData()`, y decidir
   si `signOut` debe cerrar todas las sesiones (`scope: 'global'`).
4. **Lectura de `harvest_settings` solo del propio huerto:** migración nueva que quite las dos políticas
   de lectura abiertas, con su test de seguridad.
5. **Fotos de QC por huerto:** limitar a la carpeta del huerto de quien llama (migración nueva y
   `storage_policies.sql`).
6. **`scripts/seed-users.cjs`:** quitar los valores de reserva del proyecto en la nube, o borrar el script.
   Opcional: revisión de secretos en `.husky/pre-commit`.
7. **Días alternativos (Holidays Act s.60):** decidir si la app lleva un registro (tabla
   `alternative_holidays`) o lo deja al programa de nóminas.
8. **`baseRepository.delete`:** quitar el borrado "suave" por defecto y el doble cast (sin uso hoy;
   limpieza).
9. **Fusionar** `docs/manager-review-2026-10-21` y `docs/wiring-audit-2026-10-23`.
10. **Decidir** sobre las herramientas de Claude Code de `claude/vñaide-code-usage-kj089r` (clase D).
