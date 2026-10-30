#!/usr/bin/env bash
# Borra las ramas viejas de harvestpro-nz (lista de docs/RAMAS.md, 30-10-2026).
# Antes de borrar una rama que NO está en main, deja una etiqueta archivo/<rama> en su punta,
# así no se pierde nada. Si una rama ha cambiado desde el 30-10, no la toca.
# Uso (Git Bash en Windows, o Linux/macOS), desde la carpeta del repo:
#   bash scripts/borrar-ramas.sh            # muestra lo que haría
#   bash scripts/borrar-ramas.sh --de-verdad
set -euo pipefail
DO=0; [ "${1:-}" = "--de-verdad" ] && DO=1
git fetch origin --prune --quiet
run() { if [ $DO = 1 ]; then "$@"; else echo "(prueba) $*"; fi; }

# Ramas que no están en main: rama  punta-esperada
SIN_FUSIONAR=(
  "audit/deep-review-2026-04-19 3df016733774d521e4b6facb3f56547503e336ce"
  "audit/harvestpro-2026-04 72a1e556e7e915ba8f7d916ad0ddbbab67b8dd04"
  "audit/harvestpro-2026-04-round2 cc6a2a489068805586607de457df0f79426bf7ba"
  "audit/reports-2026-04-22 edea825f006aed7ccaef6b676062f08cfa5866b4"
  "docs/deploy-runbook-2026-04-19 d63117e8fca6dc12bf75f6e4e78da2fed2635e74"
  "docs/research-and-audits-2026-04-23 4ef1bdaa1c50ee7bdbb020442373b4dacba08007"
  "feat/pilot-hardening 048b595d23f2a6fa8e87fce3d6b83083fee02da4"
  "fix/check-compliance-settings-table-2026-04-22 b386dcd1d51671a84a7a7770a78fd13aa068c02a"
  "fix/critical-audit-2026-04-19 7653373e3644d3bd7f22a27c856bde7c054a456f"
  "fix/harvest-settings-rls-wage-theft-2026-04-22 675a2f52ecf8488b963ada856e2698d01474382d"
  "fix/kiwisaver-rate-2026-04-22 41c8bbbf1f5fa9a614a04043593ab890ede83a77"
  "fix/logout-clear-caches-2026-04-22 70fe2bf52af8463924b295dafd78af084ef182c6"
  "fix/meal-break-paid-flag-2026-04-22 2323a58f0aa3c65da1466dce989dbc7e35860737"
  "fix/provision-orchard-schema-2026-04-22 d1d62bf0781686c181f0017d406c8050fe682d69"
  "fix/qc-photos-privacy-2026-04-22 75d1304604dc2dce45473257d485a7daaf8eefc8"
  "fix/remove-ghost-user-2026-04-22 7d157265b52797d5a1889920b577e1df68e8ee70"
  "fix/remove-hardcoded-secrets-2026-04-22 5b8468a9ebbf1d7e3c4070032989951e7b1b488f"
  "fix/rls-close-remaining-tables-2026-04-22 b8f5089d7bc87c6dae0a8778d6f470bbd17715fb"
  "fix/role-escalation-2026-04-22 32cf434e62527f801728b8d63c8c311b74955579"
  "fix/security-attendance 0fdb573d56a2043db03cb0a0f2278cc208e03c1c"
  "fix/sentry-posthog-pii-redaction-2026-04-22 77966076e88ea11465c63281e2557466e6a71fac"
  "harvest-fixes 64aa4103f022cffbc0cb15b9c44e190fa8138d64"
  "improve/heartbeat-2026-03-30 b546031424ec44e4744253bde791ae7b07efeed6"
  "improve/heartbeat-2026-04-06 90f609e5aade8225150057393d458f3a2c9aaba8"
  "improve/heartbeat-2026-04-12 bba90864df014191621a31512e9b0094e30bbfe6"
  "improve/heartbeat-2026-04-17 1bc61137e9984ac8c07c9a92f93b415868ee8890"
  "improve/heartbeat-2026-04-18 efae4f868094183dfb3c973ab4a59132678b25b4"
  "improve/heartbeat-2026-04-23 9fe20cb908dffb22347f5a6108b5c5d39cbf43b8"
  "improve/test-coverage-2026-03-30 0e8af8a6f1190b53b06c45f66375283ab3965696"
  "lab/autonomous-2026-04-21 df578c4be0f84873c99d5bac4d533e8c0322ae38"
  "lab/hp-infra-03-ci-secret-regex-false-positive 2199848379077e873f049f6893bd9545c34e4550"
  "lab/hp-sec-03-chats-rls-tighten d1a12d09d7125cebdce189829babed56bd67d492"
  "phase-1-refactor-and-cleanup-16646578613640258155 3ebce5996c4976bcf2f84418c077570dbb32f97e"
  "review/combined-2026-10-24 919efff9558a930f9b433a49aede46e1b6bc2cd9"
  "test/coverage-boost-2026-04-19 9fbca8b5aa083ecec0626efba5e0373961b8f911"
  "test/repo-coverage-edge-fn-optimistic-2026-04-22 86787336d1f8dce6e133930ed4be9990ecdb441c"
  "wip/runner-verify 63fb9df4c62d8caa77dfe7b204d72fac14739b6e"
  "wip/team-leader-verify f7229dc9708df598fc298a8caab81c60799fc60c"
)

# Ramas ya contenidas en main (no necesitan etiqueta)
FUSIONADAS=(
  "chore/ci-gaps-and-cleanup"
  "chore/locales-en-es-fr"
  "docs/fase-1-estado"
  "docs/manager-review-2026-10-21"
  "docs/refresh-2026-10"
  "docs/wiring-audit-2026-10-23"
  "fase-2/seguridad-dinero"
  "feat/chat-and-offline"
  "feat/chat-reactions-reply"
  "feat/company-setup-from-zero"
  "feat/daily-piece-rates"
  "feat/export-unified-pay"
  "feat/hr-block2"
  "feat/hr-review"
  "feat/my-account"
  "feat/owner-decisions"
  "feat/pay-week-close"
  "feat/people-single-source"
  "feat/push-and-offline-rollcall"
  "feat/role-comms"
  "feat/shifts-and-varieties"
  "feat/unified-pay-calc"
  "fix/admin-signup-block4"
  "fix/audit-harvest"
  "fix/broken-screens"
  "fix/inventario-seguridad"
  "fix/local-dev-bootstrap"
  "fix/manager-review"
  "fix/messaging-block3"
  "fix/picker-team-rules"
  "fix/pilot-blockers"
  "fix/qc-logistics"
  "fix/qc-review"
  "fix/runner-review"
  "fix/runner-review-int"
  "fix/screens-unified-hours"
  "fix/security-block5"
  "fix/team-leader-review"
  "fix/team-leader-review-int"
  "fix/time-and-presence"
  "improve/a11y-non-visual"
  "improve/data-loss-gaps"
  "improve/db-security-tests"
  "improve/edge-function-tests"
  "improve/god-files-2"
  "improve/god-files-cleanup"
  "improve/i18n-audit"
  "improve/integration"
  "improve/lazy-locales"
  "improve/mobile-e2e"
  "improve/offline-chaos"
  "improve/payroll-differential"
  "improve/perf-mobile"
  "improve/review-independent"
  "improve/round2"
  "improve/round3"
  "improve/round4"
  "improve/round5"
  "improve/sync-split-bugs"
  "improve/test-mocks-fix"
  "improve/test-quality-mutation"
  "integracion/fase-0"
  "integration/2026-10-22"
  "mejoras/2026-10-30"
  "perf/season-load-sim"
  "review/combined-2026-10-24b"
  "staging/auto-2026-04-21"
  "test/ci-verification"
  "v15-fix-blockers"
)

borrar=()
for e in "${SIN_FUSIONAR[@]}"; do
  b=${e% *}; s=${e#* }
  cur=$(git rev-parse -q --verify "refs/remotes/origin/$b" || true)
  if [ -z "$cur" ]; then echo "ya no existe: $b"; continue; fi
  if [ "$cur" != "$s" ]; then echo "CAMBIÓ desde el 30-10, no se toca: $b"; continue; fi
  t="archivo/$(printf '%s' "$b" | sed 's#[^A-Za-z0-9._/-]#_#g')"
  run git push origin "$s:refs/tags/$t"
  borrar+=("$b")
done
for b in "${FUSIONADAS[@]}"; do
  cur=$(git rev-parse -q --verify "refs/remotes/origin/$b" || true)
  if [ -z "$cur" ]; then echo "ya no existe: $b"; continue; fi
  if ! git merge-base --is-ancestor "$cur" origin/main; then echo "ya NO está en main, no se toca: $b"; continue; fi
  borrar+=("$b")
done
for b in "${borrar[@]}"; do
  case "$b" in main|archive/2026-04) echo "protegida: $b"; continue;; esac
  run git push origin --delete "$b"
done
echo "Ramas borradas (o a borrar): ${#borrar[@]}"
