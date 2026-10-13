#!/usr/bin/env bash
# payroll-differential-week.sh — semana realista de nómina contra la BD local y
# la Edge Function de ESTE checkout, comparada con la implementación de
# referencia (src/test/payroll-reference/reference.ts).
#
# Crea dos huertos y siete personas de prueba en la semana de Matariki 2026,
# llama a calculate-payroll (empresa y por huerto) y a close-pay-week, compara
# al céntimo y lo borra todo al final (la semana se reabre antes de borrar).
#
# Requiere el Supabase local en marcha. Variables (por defecto, las de
# /home/claude/.hp-local-env si existe): VITE_SUPABASE_URL,
# VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
#
# Uso:
#   scripts/payroll-differential-week.sh            # usa FUNCTIONS_URL o arranca un runtime privado
#   FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1 scripts/payroll-differential-week.sh
#   STOP_RUNTIME=1 scripts/payroll-differential-week.sh   # para el runtime privado al acabar
#
# La prueba rápida (sin BD, en la suite de Vitest):
#   npx vitest run src/test/payroll-reference
#   PAYROLL_DIFF_RUNS=3000 npx vitest run src/test/payroll-reference   # pasada larga
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${HP_LOCAL_ENV:-/home/claude/.hp-local-env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

export SUPABASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY is required}}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

if [ -z "${FUNCTIONS_URL:-}" ]; then
  export EDGE_PORT="${EDGE_PORT:-54393}"
  if [ -f /root/.ccr/ca-bundle.crt ]; then
    "$ROOT/scripts/dev-edge-runtime.sh" start
    export FUNCTIONS_URL="http://127.0.0.1:$EDGE_PORT"
  else
    # PC del dueño: `supabase functions serve` sirve este checkout
    export FUNCTIONS_URL="$SUPABASE_URL/functions/v1"
  fi
fi

cleanup() {
  rm -f "$ROOT/deno.lock.payroll-diff"
  if [ "${STOP_RUNTIME:-0}" = 1 ]; then "$ROOT/scripts/dev-edge-runtime.sh" stop || true; fi
}
trap cleanup EXIT

cd "$ROOT"
DENO_CERT="${DENO_CERT:-/root/.ccr/ca-bundle.crt}" deno test --allow-net --allow-env --allow-read \
  --lock="$ROOT/deno.lock.payroll-diff" supabase/functions/tests/payroll_differential_week_test.ts
