#!/usr/bin/env bash
# local-stack.sh — levanta en la CI (o en un PC limpio) el mismo Supabase local
# que usa el dueño: migraciones, seeds, Edge Functions con claves VAPID de
# prueba, y deja las variables en .env.local para Playwright y los tests Deno.
#
# NO usar en un PC donde ya hay un Supabase con datos: `supabase start` lo
# reutilizaría y los seeds se aplicarían encima. Pensado para el runner de
# GitHub Actions, que empieza vacío en cada ejecución.
#
# Uso:
#   scripts/ci/local-stack.sh start      # start + seeds + .env.local + espera a las funciones
#   scripts/ci/local-stack.sh reset [versión]  # base vacía (solo migraciones, hasta <versión> si se da)
#   scripts/ci/local-stack.sh seed             # aplica los seeds
#   scripts/ci/local-stack.sh disable-mfa      # 2FA del servidor apagado (como en desarrollo)
#   scripts/ci/local-stack.sh wait-functions
#
# Variables: SUPABASE_BIN (def. supabase), SEEDS (lista separada por espacios).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
SUPABASE="${SUPABASE_BIN:-supabase}"
SEEDS="${SEEDS:-seed_00_local_bootstrap.sql seed_2weeks_local.sql seed_role_users.sql seed_today_local.sql}"
# Sin Studio ni analítica: la CI no los usa y tardan en arrancar
EXCLUDED='studio,imgproxy,logflare,vector,supavisor,postgres-meta'
FUNCTIONS_ENV="$ROOT/supabase/functions/.env"

log() { printf '[local-stack] %s\n' "$*" >&2; }

if [ -f "$ROOT/.env.local" ] && [ -z "${CI:-}" ]; then
  log ".env.local already exists: this script is for CI / a clean machine. Nothing done."
  exit 1
fi

vapid_keys() {
  # Claves VAPID de prueba: send-push las necesita y su test usa un servicio push falso
  [ -f "$FUNCTIONS_ENV" ] && return 0
  node --input-type=module -e '
    const { subtle } = globalThis.crypto;
    const k = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const b64u = (b) => Buffer.from(b).toString("base64url");
    console.log("VAPID_PUBLIC_KEY=" + b64u(await subtle.exportKey("raw", k.publicKey)));
    console.log("VAPID_PRIVATE_KEY=" + b64u(await subtle.exportKey("pkcs8", k.privateKey)));
    console.log("VAPID_SUBJECT=mailto:ci@harvestpro.nz");
  ' >"$FUNCTIONS_ENV"
  log "Wrote test VAPID keys to supabase/functions/.env"
}

write_env() {
  local status api anon service db
  status="$("$SUPABASE" status -o env 2>/dev/null)"
  get() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" <<<"$status" | head -1; }
  api="$(get API_URL)"; anon="$(get ANON_KEY)"; service="$(get SERVICE_ROLE_KEY)"; db="$(get DB_URL)"
  [ -n "$api" ] && [ -n "$anon" ] && [ -n "$service" ] || { log "supabase status did not return the keys"; exit 1; }
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::add-mask::$anon"
    echo "::add-mask::$service"
  fi
  # Público de la app (VITE_*), el de los tests Deno (SUPABASE_*) y el de los helpers psql (DB_URL)
  # VAPID pública: la misma que tienen las funciones (el registro push la compara)
  local vapid_public
  vapid_public="$(sed -n 's/^VAPID_PUBLIC_KEY=//p' "$FUNCTIONS_ENV")"
  cat >"$ROOT/.env.local" <<ENV
VITE_SUPABASE_URL=$api
VITE_SUPABASE_ANON_KEY=$anon
VITE_VAPID_PUBLIC_KEY=$vapid_public
SUPABASE_URL=$api
SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
DB_URL=$db
ENV
  # Runtime de funciones directo (sin kong): el kong local responde CORS con «*» y
  # taparía lo que contestan las funciones; los tests Deno lo usan (FUNCTIONS_URL)
  local edge ip
  edge="$(docker ps --filter 'name=^supabase_edge_runtime_' --format '{{.Names}}' | head -1)"
  ip="$(docker inspect "$edge" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')"
  if [ -n "$ip" ]; then echo "FUNCTIONS_URL=http://$ip:8081" >>"$ROOT/.env.local"; fi
  log "Wrote .env.local for $api (functions direct: ${ip:-no})"
}

apply_seeds() {
  local db
  db="$(sed -n 's/^DB_URL=//p' "$ROOT/.env.local")"
  for seed in $SEEDS; do
    log "Seed $seed"
    psql "$db" -X -q -v ON_ERROR_STOP=1 -f "supabase/seeds/$seed" >/dev/null
  done
}

# Llama a cada función (OPTIONS, sin JWT) hasta que todas arrancan: el primer
# arranque descarga sus dependencias (deno.land, esm.sh, npm)
wait_functions() {
  local base fn code pending deadline=$((SECONDS + 300))
  base="$(sed -n 's/^SUPABASE_URL=//p' "$ROOT/.env.local")/functions/v1"
  while :; do
    pending=()
    for dir in supabase/functions/*/; do
      fn="$(basename "$dir")"
      [ "$fn" = "_shared" ] || [ "$fn" = "tests" ] && continue
      code="$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:3000' "$base/$fn" || true)"
      [ "$code" = "200" ] || [ "$code" = "204" ] || pending+=("$fn:$code")
    done
    [ ${#pending[@]} -eq 0 ] && { log "All Edge Functions boot"; return 0; }
    if [ $SECONDS -ge $deadline ]; then
      log "Edge Functions not booting: ${pending[*]}"
      docker logs --tail 200 "$(docker ps --filter name=supabase_edge_runtime --format '{{.Names}}' | head -1)" >&2 || true
      return 1
    fi
    log "Waiting for: ${pending[*]}"
    sleep 5
  done
}

case "${1:-}" in
  start)
    vapid_keys
    "$SUPABASE" start -x "$EXCLUDED"
    write_env
    apply_seeds
    wait_functions
    ;;
  reset)
    # Base recién migrada sin datos (el proyecto no define [db.seed] con archivos propios).
    # Con versión: solo las migraciones hasta ella (copias de un esquema anterior)
    "$SUPABASE" db reset --local --no-seed ${2:+--version "$2"}
    write_env
    wait_functions
    ;;
  seed) apply_seeds ;;
  disable-mfa)
    # Como un PC de desarrollo: sin 2FA exigido por el servidor (scripts/dev-disable-mfa.sql)
    psql "$(sed -n 's/^DB_URL=//p' "$ROOT/.env.local")" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev-disable-mfa.sql"
    ;;
  wait-functions) wait_functions ;;
  *) sed -n '2,18p' "$0"; exit 2 ;;
esac
