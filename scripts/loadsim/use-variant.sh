#!/usr/bin/env bash
# Pone el servidor local con las Edge Functions y migraciones de una variante:
#   current   = como estaba main antes de la prueba de carga (commit base)
#   optimized = esta rama
# y deja la base de datos recién creada con la empresa simulada (reset.sh).
# Uso: scripts/loadsim/use-variant.sh current|optimized [args de reset.sh]
set -euo pipefail
cd "$(dirname "$0")/../.."
BASE=${LOADSIM_BASE:-ff70f84}
case "${1:?current|optimized}" in
  current)
    git checkout "$BASE" -- supabase/functions supabase/migrations
    rm -f supabase/migrations/20261021*.sql supabase/functions/_shared/fetch-in-chunks.ts
    ;;
  optimized)
    git checkout HEAD -- supabase/functions supabase/migrations
    ;;
  *) echo "variante desconocida: $1"; exit 1 ;;
esac
shift
docker restart supabase_edge_runtime_harvestpro-nz >/dev/null
scripts/loadsim/reset.sh "$@"
