#!/usr/bin/env bash
# dev-edge-runtime.sh — hace funcionar el edge runtime local de Supabase en un
# contenedor que sale a internet por un proxy HTTPS con CA propia.
#
# SOLO para ese entorno (agentes en contenedor con /root/.ccr/ca-bundle.crt).
# En el PC del dueño (Windows, `supabase start` normal) no hace falta y no se
# usa: si no hay bundle de CA, el script avisa y sale sin tocar nada.
#
# Problema: el contenedor supabase_edge_runtime_<proyecto> descarga deno.land,
# esm.sh y npm al arrancar cada función, pero el proxy re-firma TLS con su CA y
# el runtime (rustls con raíces fijas) no acepta DENO_CERT/SSL_CERT_FILE →
# "invalid peer certificate: UnknownIssuer" → 503 BOOT_ERROR en todo.
# Solución: descargar las dependencias con el deno del host (que sí confía en
# la CA) a un DENO_DIR y dárselo al runtime como caché; con todo en caché no
# necesita red. Si el runtime pide un paquete npm que falta (p. ej. su
# @types/node interno), se lee del log, se descarga y se reintenta.
#
# Uso:
#   scripts/dev-edge-runtime.sh seed     # llena la caché local (host deno)
#   scripts/dev-edge-runtime.sh shared   # seed + copia la caché al contenedor
#                                        # compartido y lo reinicia (~3 s caído)
#   scripts/dev-edge-runtime.sh start    # runtime PRIVADO que sirve las funciones
#                                        # de ESTE checkout en 127.0.0.1:$EDGE_PORT
#                                        # (para probar cambios sin tocar el compartido)
#   scripts/dev-edge-runtime.sh stop     # para el runtime privado
#   scripts/dev-edge-runtime.sh status
#
# Variables: EDGE_CA_BUNDLE (def. /root/.ccr/ca-bundle.crt), EDGE_PROJECT
# (def. harvestpro-nz), EDGE_PORT (def. 54398), EDGE_CACHE_DIR
# (def. ~/.cache/hp-edge-runtime), EDGE_NAME (def. hp-edge-<carpeta>).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCS="$ROOT/supabase/functions"
CA="${EDGE_CA_BUNDLE:-/root/.ccr/ca-bundle.crt}"
PROJECT="${EDGE_PROJECT:-harvestpro-nz}"
SHARED="supabase_edge_runtime_${PROJECT}"
NETWORK="supabase_network_${PROJECT}"
PORT="${EDGE_PORT:-54398}"
CACHE="${EDGE_CACHE_DIR:-$HOME/.cache/hp-edge-runtime}"
NAME="${EDGE_NAME:-hp-edge-$(basename "$ROOT")}"
DENO_DIR_HOST="$CACHE/deno"

log() { printf '[edge-runtime] %s\n' "$*" >&2; }

if [ ! -f "$CA" ]; then
  log "No proxy CA bundle at $CA: this workaround is not needed here. Nothing done."
  exit 0
fi
command -v deno >/dev/null || { log "deno is required on the host"; exit 1; }
command -v docker >/dev/null || { log "docker is required"; exit 1; }

# Descarga módulos remotos y paquetes npm con el deno del host.
# --minimum-dependency-age=0: el runtime elige la versión más alta del
# registry.json en caché; hay que tener esa misma versión descargada.
deno_cache() {
  mkdir -p "$DENO_DIR_HOST"
  DENO_DIR="$DENO_DIR_HOST" DENO_CERT="$CA" deno cache --quiet --no-config --node-modules-dir=none \
    --minimum-dependency-age=0 "$@"
}

seed() {
  log "Caching function dependencies into $DENO_DIR_HOST"
  deno_cache "$FUNCS"/*/index.ts
}

# Si el log del contenedor pide un paquete npm que no está en caché, lo descarga.
# Devuelve 0 si añadió algo (hay que reiniciar y reintentar).
fill_missing_from_logs() {
  local container="$1" spec tmp
  spec="$(docker logs --since 2m "$container" 2>&1 \
    | grep -oE "Failed caching npm package '[^']+'|registry.npmjs.org/[^ )]+\): client error" \
    | tail -1 || true)"
  [ -z "$spec" ] && return 1
  if [[ "$spec" == Failed* ]]; then
    spec="$(sed -E "s/.*'([^']+)'.*/\1/" <<<"$spec")"
  else
    spec="$(sed -E 's#registry.npmjs.org/([^ )]+)\).*#\1#; s#%2f#/#I' <<<"$spec")"
    # URL de tarball: <pkg>/-/<nombre>-<versión>.tgz → <pkg>@<versión>
    if [[ "$spec" == */-/*.tgz ]]; then
      local pkg="${spec%%/-/*}" file="${spec##*/}"
      file="${file%.tgz}"
      spec="$pkg@${file#"${pkg##*/}"-}"
    fi
  fi
  log "Runtime asked for npm:$spec — caching it"
  tmp="$(mktemp -d)"
  printf 'import "npm:%s";\n' "$spec" >"$tmp/dep.ts"
  deno_cache "$tmp/dep.ts" || true
  rm -rf "$tmp"
  return 0
}

# Llama a cada función (OPTIONS, sin JWT) y comprueba que ninguna da BOOT_ERROR
all_boot() {
  local base="$1" fn code ok=0
  for dir in "$FUNCS"/*/; do
    fn="$(basename "$dir")"
    [ "$fn" = "_shared" ] || [ "$fn" = "tests" ] && continue
    code="$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:5173' "$base/$fn" || true)"
    if [ "$code" != "200" ] && [ "$code" != "204" ]; then
      log "  $fn → $code"
      ok=1
    fi
  done
  return $ok
}

boot_until_ok() {
  local container="$1" base="$2" sync_cmd="${3:-}"
  for attempt in 1 2 3 4 5 6; do
    # Espera a que el runtime acepte conexiones
    # (con kong delante: 502 mientras el contenedor reinicia)
    for _ in $(seq 1 30); do
      case "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$base/" || true)" in
        000|502) sleep 1 ;;
        *) break ;;
      esac
    done
    if all_boot "$base"; then log "All functions boot ($container)"; return 0; fi
    fill_missing_from_logs "$container" || { log "Boot failed and no missing package found; see: docker logs $container"; return 1; }
    [ -n "$sync_cmd" ] && eval "$sync_cmd"
    docker restart "$container" >/dev/null
    log "Retry $attempt"
  done
  return 1
}

sync_shared() {
  docker cp "$DENO_DIR_HOST/." "$SHARED:/root/.cache/deno/"
}

vapid_env() {
  # Claves VAPID de prueba (solo para el runtime privado; el sumidero de push de los tests las usa)
  local f="$CACHE/vapid.env"
  if [ ! -f "$f" ]; then
    deno eval '
      const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
      const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      console.log("VAPID_PUBLIC_KEY=" + b64u(await crypto.subtle.exportKey("raw", k.publicKey)));
      console.log("VAPID_PRIVATE_KEY=" + b64u(await crypto.subtle.exportKey("pkcs8", k.privateKey)));
      console.log("VAPID_SUBJECT=mailto:dev@harvestpro.nz");
    ' >"$f"
  fi
  cat "$f"
}

start_private() {
  docker inspect "$SHARED" >/dev/null 2>&1 || { log "Shared runtime $SHARED not found (is the stack running?)"; exit 1; }
  seed
  local image envfile main
  image="$(docker inspect "$SHARED" --format '{{.Config.Image}}')"
  envfile="$CACHE/runtime.env"
  main="$CACHE/main-index.ts"
  # Mismo entorno y mismo servicio principal (verificación de JWT) que el compartido
  docker inspect "$SHARED" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v -e '^PATH=' -e '^$' >"$envfile"
  vapid_env >>"$envfile"
  docker cp "$SHARED:/root/index.ts" "$main"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --network "$NETWORK" --memory 768m \
    -p "127.0.0.1:$PORT:8081" --env-file "$envfile" \
    --add-host host.docker.internal:host-gateway \
    -v "$DENO_DIR_HOST:/root/.cache/deno" -v "$main:/root/index.ts:ro" \
    -v "$FUNCS:$FUNCS:ro" -w "$ROOT" \
    --entrypoint sh "$image" -c 'exec edge-runtime start --main-service=/root --port=8081 --policy=per_worker' >/dev/null
  boot_until_ok "$NAME" "http://127.0.0.1:$PORT"
  log "Private runtime: FUNCTIONS_URL=http://127.0.0.1:$PORT (serves $FUNCS)"
}

case "${1:-}" in
  seed) seed ;;
  shared)
    seed
    sync_shared
    docker restart "$SHARED" >/dev/null
    boot_until_ok "$SHARED" "http://127.0.0.1:54321/functions/v1" sync_shared
    ;;
  start) start_private ;;
  stop) docker rm -f "$NAME" >/dev/null 2>&1 && log "Stopped $NAME" || log "$NAME not running" ;;
  status)
    docker ps --filter "name=$NAME" --filter "name=$SHARED" --format '{{.Names}}\t{{.Status}}'
    ;;
  *) sed -n '2,30p' "$0"; exit 2 ;;
esac
