# Inventario de ramas — 30-10-2026

Foto de las **112 ramas remotas** de `ibra1927jn/harvestpro-nz` (contando `main`) el 30-10-2026.
**No se ha borrado ni fusionado nada.** Las recomendaciones son propuestas: decide Ibra.

Cómo se hizo:

- "¿En main?" = sale en `git branch -r --merged origin/main` (42 ramas, `main` incluida).
- "Commits fuera de main" = `git rev-list --count origin/main..rama`.
- Para las que no están en main se comprobó si están **dentro** de las ramas de integración de octubre
  (`git merge-base --is-ancestor`), y se cruzó con el inventario por contenido del 27-10
  (`docs/audits/2026-10-27-inventario-ramas.md` en `integracion/fase-0`) y con los PR de GitHub.

## Resumen

| Recomendación | Ramas | Qué significa |
|---|---|---|
| **fusionar** | 3 | Trabajo de octubre que aún no está en `main` (la cadena `integracion/fase-0` → `fase-2/seguridad-dinero` → `docs/fase-1-estado`) |
| **borrar** | 103 | Ya están en `main` (41), o su contenido está dentro de `integracion/fase-0`, o son de abril y quedan guardadas en `archive/2026-04` |
| **revisar** | 4 | Queda una decisión o una tarea pequeña (3 arreglos de abril y las herramientas de Claude de julio) |
| **conservar** | 1 | `archive/2026-04`, la copia de todas las ramas de abril |

(+ `main`.)

## Lo importante

### 1. El trabajo de octubre no está en main

`main` se quedó en el **19-10** (`ff70f84`). Todo lo del 19 al 27-10 está en una cadena de ramas, cada una
dentro de la siguiente:

```
main (19-10)
 └─ integration/2026-10-22      (PR #84 → main)    revisiones por rol, precio por día, chat, push…
     └─ review/combined-2026-10-24b (PR #89, "no fusionar") + time-and-presence, company-setup, ci-gaps
         └─ integracion/fase-0  (PR #90 → main, CI en verde)  + 4 arreglos de seguridad + docs al día
             ├─ docs/fase-1-estado        (PR #91, CI en verde)  solo un documento
             └─ fase-2/seguridad-dinero   (PR #92, CI en verde)  matriz RLS de 35 tablas, nómina
```

- `integration/2026-10-22`, `review/combined-2026-10-24b` y `fix/manager-review` **no** se fusionan por
  separado: están enteras dentro de `integracion/fase-0`. Lo mismo pasa con `chore/locales-en-es-fr`
  (en/es/fr).
- **Orden recomendado:** fusionar el PR **#90** (`integracion/fase-0` → `main`); después #92 y #91
  (cambiar su base a `main` antes). Con eso, `main` tiene todo hasta el 27-10.
- Después de fusionar #90, se pueden cerrar los PR viejos que apuntan a `main` o a
  `integration/2026-10-22` (#67–#89 abiertos) y borrar sus ramas.

### 2. PR #6 (endurecimiento RLS)

- Rama `fix/critical-audit-2026-04-19`. El PR #6 está **cerrado sin fusionar** desde el 22-04-2026 (iba
  marcado "DO NOT MERGE").
- No hay que recuperarlo: sus 3 arreglos críticos se **rehicieron en octubre** — políticas abiertas
  cerradas (migraciones de octubre + test `01_catalog.sql`), el `audit_log` de `mpi-export` corregido y el
  2FA exigido en el servidor (`20261014000000_server_side_mfa.sql`). La Fase 2 (`fase-2/seguridad-dinero`,
  PR #92) añade además una matriz RLS de las 35 tablas.
- Recomendación: **borrar** la rama (queda guardada en `archive/2026-04`).

### 3. Lo que queda por revisar

| Rama | Qué falta decidir o hacer |
|---|---|
| `fix/signout-global-and-requirerole-db-2026-04-22` | ¿Cerrar sesión en **todos** los dispositivos de la persona (`signOut({ scope: 'global' })`)? Ni main ni la Fase 2 lo hacen. |
| `fix/alt-holiday-cross-period-2026-04-22` | Días alternativos (Holidays Act s.60): ¿los guarda la app (tabla `alternative_holidays`) o los lleva el programa de nóminas? |
| `fix/base-repository-soft-delete-2026-04-22` | Limpieza: `baseRepository.delete` aún tiene el doble cast `as unknown as Partial<T>`. Nadie lo usa. |
| `claude/vñaide-code-usage-kj089r` | Herramientas de Claude Code de julio (`.claude/`, `tests/rls/`). Si se quieren, rehacerlas sobre `main`, no fusionar. |

En los tres arreglos de abril la tarea se hace sobre `main`, no se fusiona la rama vieja.

## Todas las ramas

Columnas: ¿fusionada en main? · fecha del último commit · commits que no están en main · último commit ·
recomendación · por qué (y PR, si tiene).

| Rama | ¿En main? | Último commit | Commits fuera de main | Último mensaje | Recomendación | Motivo |
|---|---|---|---|---|---|---|
| `docs/fase-1-estado` | no | 2026-10-27 | 179 | docs(audit): Fase 1 status of the 2026-10-23 wiring audit on integracion/fase-0 | **fusionar** | Solo un documento (estado de la Fase 1) encima de integracion/fase-0. PR #91, CI en verde. PR: #91 (abierto) |
| `fase-2/seguridad-dinero` | no | 2026-10-27 | 201 | docs: attendance and bucket access per orchard in CLAUDE.md and CHANGELOG | **fusionar** | Punta de la cadena de octubre (contiene integracion/fase-0 + Fase 2: matriz RLS de 35 tablas, revisión de nómina). PR #92 hacia integracion/fase-0, CI en verde. PR: #92 (abierto) |
| `fix/inventario-seguridad` | no | 2026-10-27 | 166 | fix(storage): restrict QC photos to the caller's orchard folder | **borrar** | Sus 4 arreglos de seguridad ya están dentro de integracion/fase-0. Borrar tras fusionar #90. |
| `integracion/fase-0` | no | 2026-10-27 | 179 | chore: remove everything tied to the deleted Supabase Cloud project | **fusionar** | Pone main al día hasta el 27-10 (contiene review/combined-2026-10-24b + 4 arreglos de seguridad + docs). PR #90 → main, CI en verde. **Es la que hay que fusionar primero.** PR: #90 (abierto) |
| `review/combined-2026-10-24b` | no | 2026-10-27 | 162 | docs(audits): branch inventory by content before merging into main | **borrar** | Todo el trabajo del 19 al 24-10 combinado; ya está dentro de integracion/fase-0. PR #89 marcado "do not merge". Borrar tras fusionar #90. PR: #89 (abierto) |
| `chore/ci-gaps-and-cleanup` | no | 2026-10-24 | 139 | ci: the push Vault secrets survive a backup and a fresh-stack recovery | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #85 (abierto) |
| `feat/company-setup-from-zero` | no | 2026-10-24 | 146 | test(e2e): start the admin login clean after /signup | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #87 (abierto) |
| `fix/time-and-presence` | no | 2026-10-24 | 130 | fix(sync): roll call queue always goes through manage-attendance; clear day-closed failures | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #86 (abierto) |
| `review/combined-2026-10-24` | no | 2026-10-24 | 144 | test(attendance): resolve merge of the stale cross-team check-in step | **borrar** | Versión anterior de la combinada; su único cambio propio (un conflicto en un test) está superado. PR #88 "do not merge". PR: #88 (abierto) |
| `chore/locales-en-es-fr` | no | 2026-10-23 | 82 | test(account): French is a valid preferred locale | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #78 (fusionado) |
| `docs/wiring-audit-2026-10-23` | no | 2026-10-23 | 1 | docs(audits): role-by-role wiring audit — buttons, tables and cross-role flows | **borrar** | Documento de auditoría; ya entra en main con integracion/fase-0 (PR #90). Borrar después. |
| `feat/chat-and-offline` | no | 2026-10-23 | 110 | Merge origin/integration/2026-10-22 (e19e750d: role comms #79, broken screens #80) into feat/chat-and-offline | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #81 (fusionado) |
| `feat/chat-reactions-reply` | no | 2026-10-23 | 114 | feat(chat): reactions, quoted replies and typing indicator in the chat window | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #82 (fusionado) |
| `feat/daily-piece-rates` | no | 2026-10-23 | 70 | chore(i18n): drop the strings of the removed variety price editor and piece rate field | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #77 (fusionado) |
| `feat/push-and-offline-rollcall` | no | 2026-10-23 | 124 | fix(push): chat notifications never carry the message text | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #83 (fusionado) |
| `feat/role-comms` | no | 2026-10-23 | 92 | chore(comms): leave team-scope SQL test as 97_, CLAUDE.md lists the LEAVE_REQUEST sync type | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #79 (fusionado) |
| `fix/broken-screens` | no | 2026-10-23 | 103 | chore(i18n): drop keys nothing uses so the fr bundle stays within budget | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #80 (fusionado) |
| `fix/runner-review` | no | 2026-10-23 | 4 | fix(runner): green CI, live own transport requests, real pickup request, TL gets correction requests | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #70 (abierto) |
| `fix/runner-review-int` | no | 2026-10-23 | 62 | Merge fix/runner-review into integration/2026-10-22 | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #75 (fusionado) |
| `fix/security-attendance` | no | 2026-10-23 | 70 | Merge origin/integration/2026-10-22 into fix/security-attendance | **borrar** | Su contenido ya está en integracion/fase-0 (solo le queda un merge vacío). PR #76 abierto: cerrar. PR: #76 (abierto) |
| `fix/team-leader-review` | no | 2026-10-23 | 5 | feat(timesheet): show the payroll review (approved / rejected with reason) on each row | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #71 (abierto) |
| `fix/team-leader-review-int` | no | 2026-10-23 | 57 | Merge fix/team-leader-review into integration/2026-10-22 (+ B8: avatar opens My account) | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #74 (fusionado) |
| `integration/2026-10-22` | no | 2026-10-23 | 124 | fix(push): chat notifications never carry the message text | **borrar** | Integración 21–23-10; está entera en integracion/fase-0. PR #84 → main (se queda viejo cuando entre #90). PR: #84 (abierto) |
| `perf/season-load-sim` | no | 2026-10-23 | 24 | fix(edge): restore batch approval, bulk record-bucket and paginated anomalies lost in 0bfab88f | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #67 (abierto) |
| `feat/hr-review` | no | 2026-10-22 | 7 | fix(hr): 2FA restrictive policy on leave_requests; update batch render test | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #72 (abierto) |
| `feat/my-account` | no | 2026-10-22 | 4 | test(db): SQL security checks for update_my_profile and the avatars bucket | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #73 (abierto) |
| `fix/manager-review` | no | 2026-10-22 | 6 | test(manager): GoalProgress asserts the pace-based goal time; cover new helpers | **borrar** | Revisión del rol manager (logística en una página, sin fin de turno…). Ya está en integracion/fase-0. PR #68 → main abierto: cerrar al fusionar #90. PR: #68 (abierto) |
| `fix/qc-review` | no | 2026-10-22 | 5 | chore(qc): drop orphaned grade labels and reuse the Card wrapper | **borrar** | Su trabajo ya está dentro de integracion/fase-0 (PR #90); se puede borrar en cuanto se fusione. PR: #69 (abierto) |
| `wip/runner-verify` | no | 2026-10-22 | 4 | wip(runner): fixes from verification pass (unverified) | **borrar** | WIP sin verificar; según el inventario del 27-10 ya se rehízo en la rama integrada. |
| `wip/team-leader-verify` | no | 2026-10-22 | 4 | wip(attendance): correct_batch hardening in manage-attendance (unverified) | **borrar** | WIP sin verificar; ya rehecho con otro código en la rama integrada. |
| `docs/manager-review-2026-10-21` | no | 2026-10-21 | 6 | docs(audits): HR review — status filter, signed contract PDF, calendar, HR roadmap vs sector tools | **borrar** | Documento de auditoría; ya entra en main con integracion/fase-0 (PR #90). Borrar después. |
| `main` | sí | 2026-10-19 | 0 | perf(battery): stop idle repaints, polling and warm-up pings | **—** | Rama principal. |
| `archive/2026-04` | no | 2026-10-16 | 149 | archive: keep April 2026 side branches reachable (superseded by October work) | **conservar** | Rama "museo": guarda las puntas de todas las ramas de abril. Conservarla como única copia. |
| `docs/refresh-2026-10` | sí | 2026-10-16 | 0 | docs: rewrite README and architecture, add October audit, archive stale docs | **borrar** | Ya fusionada en main. |
| `fix/picker-team-rules` | sí | 2026-10-16 | 0 | chore(repo): remove dead cloud setup script, Supabase CLI temp files and log dumps | **borrar** | Ya fusionada en main. PR: #60 (cerrado) |
| `feat/owner-decisions` | sí | 2026-10-14 | 0 | test(db): security suite always runs with server-side 2FA on | **borrar** | Ya fusionada en main. PR: #58 (abierto) |
| `fix/audit-harvest` | sí | 2026-10-14 | 0 | fix(ci): validate stacked pull requests and isolated database contracts | **borrar** | Ya fusionada en main. PR: #59 (abierto) |
| `improve/i18n-audit` | sí | 2026-10-14 | 0 | fix(i18n): HR bottom nav fits 360px in every language; e2e covers payroll and HR | **borrar** | Ya fusionada en main. |
| `improve/lazy-locales` | sí | 2026-10-14 | 0 | test(e2e): languages offline and Spanish cold-start measurements | **borrar** | Ya fusionada en main. |
| `improve/round5` | sí | 2026-10-14 | 0 | test(ui): InlineSelect shows translated status labels | **borrar** | Ya fusionada en main. PR: #57 (abierto) |
| `feat/hr-block2` | sí | 2026-10-13 | 0 | test(hr): leave panel shows no sample entries | **borrar** | Ya fusionada en main. PR: #49 (abierto) |
| `fix/admin-signup-block4` | sí | 2026-10-13 | 0 | fix(admin): first-company signup, new-orchard wizard and user deactivation | **borrar** | Ya fusionada en main. PR: #51 (abierto) |
| `fix/messaging-block3` | sí | 2026-10-13 | 0 | fix(messaging): read receipts, unread counts, acknowledged broadcasts and push | **borrar** | Ya fusionada en main. PR: #50 (abierto) |
| `fix/security-block5` | sí | 2026-10-13 | 0 | fix(db): fresh installs apply all migrations and seeds | **borrar** | Ya fusionada en main. PR: #52 (abierto) |
| `improve/a11y-non-visual` | sí | 2026-10-13 | 0 | test(e2e): non-visual a11y gate for every role, field flows and 200% zoom | **borrar** | Ya fusionada en main. |
| `improve/data-loss-gaps` | sí | 2026-10-13 | 0 | fix(sync): show the changes that could not be sent (dead letter queue) | **borrar** | Ya fusionada en main. |
| `improve/db-security-tests` | sí | 2026-10-13 | 0 | fix(storage): only QC staff upload QC photos and only the uploader deletes them | **borrar** | Ya fusionada en main. |
| `improve/edge-function-tests` | sí | 2026-10-13 | 0 | test(edge): skip CORS checks behind the local kong gateway | **borrar** | Ya fusionada en main. |
| `improve/god-files-2` | sí | 2026-10-13 | 0 | docs(claude-md): refresh the Tests section and stale module notes | **borrar** | Ya fusionada en main. |
| `improve/god-files-cleanup` | sí | 2026-10-13 | 0 | refactor(picker-drawer): move role colours and labels to drawerTheme | **borrar** | Ya fusionada en main. |
| `improve/integration` | sí | 2026-10-13 | 0 | test(db): security harness ignores pay weeks already closed in the target DB | **borrar** | Ya fusionada en main. PR: #53 (abierto) |
| `improve/mobile-e2e` | sí | 2026-10-13 | 0 | fix(chat): phones show the conversation list full width | **borrar** | Ya fusionada en main. |
| `improve/offline-chaos` | sí | 2026-10-13 | 0 | test(sync): explicit assertion in the lost-response transport chaos case | **borrar** | Ya fusionada en main. |
| `improve/payroll-differential` | sí | 2026-10-13 | 0 | fix(constants): 2025 minimum wage is 23.50 (23.15 was the 2024 rate) | **borrar** | Ya fusionada en main. |
| `improve/perf-mobile` | sí | 2026-10-13 | 0 | perf(auth): fetch the orchard list in parallel with the user profile | **borrar** | Ya fusionada en main. |
| `improve/review-independent` | sí | 2026-10-13 | 0 | fix(db): deactivated staff lose access to HR documents and bins | **borrar** | Ya fusionada en main. |
| `improve/round2` | sí | 2026-10-13 | 0 | Merge branch 'improve/perf-mobile' into improve/round2 | **borrar** | Ya fusionada en main. PR: #54 (abierto) |
| `improve/round3` | sí | 2026-10-13 | 0 | Merge branch 'improve/offline-chaos' into improve/round3 | **borrar** | Ya fusionada en main. PR: #55 (abierto) |
| `improve/round4` | sí | 2026-10-13 | 0 | test(e2e): ignore screen-reader live regions when matching on-screen messages | **borrar** | Ya fusionada en main. PR: #56 (abierto) |
| `improve/sync-split-bugs` | sí | 2026-10-13 | 0 | fix(outbox): a resend rejected after a lost response is not shown as failed | **borrar** | Ya fusionada en main. |
| `improve/test-mocks-fix` | sí | 2026-10-13 | 0 | ci(test): add test:mock-guard so mocks cannot be silently ignored again | **borrar** | Ya fusionada en main. |
| `improve/test-quality-mutation` | sí | 2026-10-13 | 0 | test: kill surviving mutants in pay, sync, conflict, compliance, export, schemas | **borrar** | Ya fusionada en main. |
| `feat/pay-week-close` | sí | 2026-10-12 | 0 | fix(store): recalculate per-picker totals after catching up on app resume | **borrar** | Ya fusionada en main. PR: #45 (abierto), #46 (fusionado) |
| `feat/people-single-source` | sí | 2026-10-12 | 0 | test: add-picker lowercase role; archived people not offered for check-in | **borrar** | Ya fusionada en main. PR: #43 (abierto) |
| `feat/shifts-and-varieties` | sí | 2026-10-12 | 0 | fix(attendance): lookups no longer assume one check-in per day | **borrar** | Ya fusionada en main. PR: #44 (abierto) |
| `fix/pilot-blockers` | sí | 2026-10-12 | 0 | feat(teams): only team leaders and HR add or remove pickers | **borrar** | Ya fusionada en main. PR: #48 (abierto) |
| `fix/qc-logistics` | sí | 2026-10-12 | 0 | fix(runner): tolerate missing bins/buckets in the logistics view | **borrar** | Ya fusionada en main. PR: #47 (abierto) |
| `feat/export-unified-pay` | sí | 2026-10-11 | 0 | test(export): integration pipeline from shifts and scans to exported files | **borrar** | Ya fusionada en main. PR: #41 (abierto) |
| `feat/unified-pay-calc` | sí | 2026-10-11 | 0 | fix(pay): stale open shift starts at check-in; server total = sum of picker totals | **borrar** | Ya fusionada en main. PR: #40 (abierto) |
| `fix/screens-unified-hours` | sí | 2026-10-11 | 0 | fix(audit): business events stored as CUSTOM with the event name in new_values | **borrar** | Ya fusionada en main. PR: #42 (abierto) |
| `fix/local-dev-bootstrap` | sí | 2026-10-10 | 0 | feat(dev): interruptor VITE_MFA_ENFORCE para desactivar el 2FA solo en local | **borrar** | Ya fusionada en main. PR: #39 (fusionado) |
| `claude/vñaide-code-usage-kj089r` | no | 2026-07-08 | 4 | feat(harness): DB verification loop — real Postgres RLS tests | **revisar** | Herramientas de Claude Code de julio (.claude/, tests/rls/). Nada de esto está en main; si se quiere, rehacerlo sobre main actual. PR: #38 (abierto) |
| `docs/research-and-audits-2026-04-23` | no | 2026-04-23 | 1 | docs(external): compile all harvest research + audits into one branch | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `improve/heartbeat-2026-04-23` | no | 2026-04-23 | 2 | refactor(ids): use safeUUID() for local temp IDs instead of Math.random() | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `audit/reports-2026-04-22` | no | 2026-04-22 | 1 | docs(audit): comprehensive 14-slice audit 2026-04-22 | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `fix/alt-holiday-cross-period-2026-04-22` | no | 2026-04-22 | 1 | fix(payroll): persist Holidays Act s.60 alt-days to avoid cross-period double-count | **revisar** | Arreglo de abril que el inventario del 27-10 marca como "falta algo" (clase B); hacer la tarea sobre main, no fusionar. Guardada en archive/2026-04. PR: #21 (abierto) |
| `fix/base-repository-soft-delete-2026-04-22` | no | 2026-04-22 | 1 | fix(types): remove soft-delete double-cast in baseRepository | **revisar** | Arreglo de abril que el inventario del 27-10 marca como "falta algo" (clase B); hacer la tarea sobre main, no fusionar. Guardada en archive/2026-04. PR: #25 (abierto) |
| `fix/check-compliance-settings-table-2026-04-22` | no | 2026-04-22 | 1 | fix(compliance): read piece_rate/min_wage from harvest_settings, not orchards | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #22 (abierto) |
| `fix/harvest-settings-rls-wage-theft-2026-04-22` | no | 2026-04-22 | 1 | fix(security): lock down harvest_settings RLS — close wage-theft vector | **borrar** | Arreglo de abril rehecho en octubre (rama fix/inventario-seguridad, dentro de integracion/fase-0). Guardada en archive/2026-04. PR: #27 (abierto) |
| `fix/kiwisaver-rate-2026-04-22` | no | 2026-04-22 | 1 | fix(payroll): bump KiwiSaver min employee + employer rate 3% → 3.5% for 2026-2027 | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #18 (abierto) |
| `fix/logout-clear-caches-2026-04-22` | no | 2026-04-22 | 1 | fix(security): purge caches + queryClient + sessionStorage on logout | **borrar** | Arreglo de abril rehecho en octubre (rama fix/inventario-seguridad, dentro de integracion/fase-0). Guardada en archive/2026-04. PR: #24 (abierto) |
| `fix/meal-break-paid-flag-2026-04-22` | no | 2026-04-22 | 1 | fix(payroll): make meal-break deduction configurable per orchard | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #20 (abierto) |
| `fix/provision-orchard-schema-2026-04-22` | no | 2026-04-22 | 1 | fix(signup): point provision-orchard to harvest_settings (was orchard_settings) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #15 (abierto) |
| `fix/qc-photos-privacy-2026-04-22` | no | 2026-04-22 | 1 | fix(security): make qc-photos bucket private + scope RLS by orchard | **borrar** | Arreglo de abril rehecho en octubre (rama fix/inventario-seguridad, dentro de integracion/fase-0). Guardada en archive/2026-04. PR: #17 (abierto) |
| `fix/remove-ghost-user-2026-04-22` | no | 2026-04-22 | 1 | fix(security): remove synthetic '00000000-...' ghost user | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #26 (abierto) |
| `fix/remove-hardcoded-secrets-2026-04-22` | no | 2026-04-22 | 1 | fix(security): remove hardcoded Supabase credentials + expand pre-commit secret scan | **borrar** | Hecho en octubre: `scripts/seed-users.cjs` se borró en integracion/fase-0 (commit a816cc5). No hay claves que cambiar (los proyectos de Supabase Cloud ya están eliminados). Guardada en archive/2026-04. PR: #19 (abierto) |
| `fix/rls-close-remaining-tables-2026-04-22` | no | 2026-04-22 | 1 | fix(security): close 10 remaining open RLS policies | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #16 (abierto) |
| `fix/role-escalation-2026-04-22` | no | 2026-04-22 | 1 | fix(security): prevent role self-escalation on public.users | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #14 (abierto) |
| `fix/sentry-posthog-pii-redaction-2026-04-22` | no | 2026-04-22 | 1 | fix(observability): scrub PII from PostHog + Sentry (NZ Privacy Act 2020 IPP 3) | **borrar** | Arreglo de abril rehecho en octubre (rama fix/inventario-seguridad, dentro de integracion/fase-0). Guardada en archive/2026-04. PR: #23 (abierto) |
| `fix/signout-global-and-requirerole-db-2026-04-22` | no | 2026-04-22 | 1 | fix(auth): signOut global scope + requireRole reads public.users (not JWT) | **revisar** | Arreglo de abril que el inventario del 27-10 marca como "falta algo" (clase B); hacer la tarea sobre main, no fusionar. Guardada en archive/2026-04. PR: #28 (abierto) |
| `test/repo-coverage-edge-fn-optimistic-2026-04-22` | no | 2026-04-22 | 1 | test(repo): add edge-functions + optimistic-lock unit tests | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #29 (fusionado) |
| `audit/harvestpro-2026-04-round2` | no | 2026-04-21 | 2 | audit(round2): re-classify findings post-PR-#8-merge | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #12 (cerrado) |
| `lab/autonomous-2026-04-21` | no | 2026-04-21 | 1 | test(analytics-trends): fix date-drift flake in getDailyBleed | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #13 (abierto) |
| `staging/auto-2026-04-21` | sí | 2026-04-21 | 0 | [LAB] HP-INFRA-03: fix secret-scan regex false-positive in CI (#11) | **borrar** | Ya fusionada en main. |
| `audit/harvestpro-2026-04` | no | 2026-04-20 | 1 | audit: HarvestPro 2026-04 — full review, 6 dimensions | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #9 (cerrado) |
| `lab/hp-infra-03-ci-secret-regex-false-positive` | no | 2026-04-20 | 1 | [LAB] HP-INFRA-03: fix secret-scan regex false-positive in CI | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #11 (fusionado) |
| `lab/hp-sec-03-chats-rls-tighten` | no | 2026-04-20 | 1 | [LAB] HP-SEC-03: tighten RLS on chats (drop 2 open policies) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #10 (cerrado) |
| `audit/deep-review-2026-04-19` | no | 2026-04-18 | 66 | docs(audit): deep-review 2026-04-19 — 6 dimensions, 37 findings | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `docs/deploy-runbook-2026-04-19` | no | 2026-04-18 | 1 | docs(deploy): add DEPLOYMENT_RUNBOOK.md for self-hosted Hetzner stack | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `fix/critical-audit-2026-04-19` | no | 2026-04-18 | 67 | fix(critical-audit): prepare fixes for the 3 CRITICAL items from 2026-04-19 audit | **borrar** | Es la rama del **PR #6 (endurecimiento RLS)**. El PR está CERRADO sin fusionar (22-04). Sus 3 arreglos críticos se rehicieron en octubre (políticas abiertas, audit_log de mpi-export, 2FA en servidor). Guardada en archive/2026-04. PR: #6 (cerrado) |
| `improve/heartbeat-2026-04-17` | no | 2026-04-18 | 12 | feat(compliance): NZ_PUBLIC_HOLIDAYS + isPublicHoliday helper (Holidays Act) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `improve/heartbeat-2026-04-18` | no | 2026-04-18 | 65 | test(integration): +12 role-flows sanity contra Supabase real | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `test/coverage-boost-2026-04-19` | no | 2026-04-18 | 4 | test(config): +17 NZ tax year registry tests (PAYE, ACC, KiwiSaver) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `v15-fix-blockers` | sí | 2026-04-17 | 0 | fix(seeds): replace local service_role key with dynamic lookup command | **borrar** | Ya fusionada en main. |
| `improve/heartbeat-2026-04-06` | no | 2026-04-12 | 1 | test(e2e): filter Mobile Chrome project to Mobile-tagged specs | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `improve/heartbeat-2026-04-12` | no | 2026-04-12 | 3 | refactor(index): replace React namespace with named imports (lazy, Suspense) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `improve/heartbeat-2026-03-30` | no | 2026-03-30 | 7 | refactor(logging): replace direct console calls with logger utility | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `improve/test-coverage-2026-03-30` | no | 2026-03-30 | 5 | test: add test files from coverage agent (partial) | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. |
| `test/ci-verification` | sí | 2026-02-12 | 0 | fix(css): extract 16 inline styles to CSS classes with custom properties | **borrar** | Ya fusionada en main. PR: #5 (fusionado) |
| `feat/pilot-hardening` | no | 2026-02-10 | 28 | Return LoadingScreen during loading state | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #3 (fusionado), #4 (cerrado) |
| `harvest-fixes` | no | 2026-02-06 | 1 | Refine demo mode, secure Gemini and improve messaging/offline | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #2 (fusionado) |
| `phase-1-refactor-and-cleanup-16646578613640258155` | no | 2026-01-30 | 4 | Integration of Phases 1, 2, and 3: Architecture, Offline, Maps | **borrar** | Rama vieja (ene–abr) superada por el trabajo de octubre; una copia queda en archive/2026-04. PR: #1 (cerrado) |

## Si se aprueba borrar

1. Primero fusionar #90 (y #92/#91). Si no, borrar las ramas de octubre perdería trabajo.
2. Las ramas de abril pueden borrarse ya: todas están dentro de `archive/2026-04`.
3. Borrar desde GitHub o con `git push origin --delete <rama>` (solo con el visto bueno de Ibra).
