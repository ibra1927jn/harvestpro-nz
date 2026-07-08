#!/usr/bin/env bash
# Levanta un Postgres efimero, aplica el shim de Supabase y TODAS las migraciones
# en orden, reportando PASS/FAIL por archivo. Deja el cluster arriba si se pasa
# --keep (para correr tests despues); si no, lo detiene y limpia.
#
# Uso:  bash tests/rls/boot.sh [--keep]
# Requiere: PostgreSQL nativo en /usr/lib/postgresql/16/bin y usuario 'postgres'.
set -uo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
BASE=${BASE:-/tmp/harvestpro-rls}
SOCK="$BASE/sock"; PGDATA="$BASE/data"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$REPO/supabase/migrations"
KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1

as_pg() { sudo -u postgres "$@"; }
PSQL()  { as_pg "$PGBIN/psql" -h "$SOCK" -U postgres -qtA "$@"; }

echo "== Preparando cluster efimero en $BASE =="
as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1 || true
rm -rf "$BASE"; mkdir -p "$SOCK" "$PGDATA"; chown -R postgres:postgres "$BASE"; chmod 755 /tmp
as_pg "$PGBIN/initdb" -A trust -U postgres -D "$PGDATA" >/dev/null 2>&1
as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$BASE/log" \
  -o "-k $SOCK -c listen_addresses='' -c fsync=off" -w start >/dev/null 2>&1
echo "   $(PSQL -c 'select version();' | cut -d, -f1)"

echo "== Cargando shim de Supabase =="
if ! PSQL -v ON_ERROR_STOP=1 -f "$REPO/tests/rls/shim.sql" >/tmp/shim.err 2>&1; then
  echo "   FALLO cargando shim:"; cat /tmp/shim.err; exit 1
fi
echo "   shim OK"

echo "== Aplicando migraciones (orden lexicografico) =="
pass=0; fail=0; failed_files=""
tmpsql="$BASE/cur.sql"
for f in $(ls "$MIG"/*.sql | sort); do
  name=$(basename "$f")
  # Neutralizar CREATE EXTENSION (contrib no instalado; uuid_generate_v4 ya shimeado).
  sed -E 's/^[[:space:]]*CREATE[[:space:]]+EXTENSION.*/-- (shim) &/I' "$f" > "$tmpsql"
  chown postgres:postgres "$tmpsql"
  if PSQL -v ON_ERROR_STOP=1 -f "$tmpsql" >"$BASE/last.err" 2>&1; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); failed_files="$failed_files $name"
    echo "   FAIL  $name"
    grep -iE "ERROR:" "$BASE/last.err" | head -2 | sed 's/^/         /'
  fi
done
echo "== Resultado: $pass OK / $fail FAIL de $((pass+fail)) migraciones =="
[ -n "$failed_files" ] && echo "   Fallidas:$failed_files"

if [ $KEEP -eq 1 ]; then
  echo "== Cluster en pie (--keep). Socket: $SOCK =="
else
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -w stop >/dev/null 2>&1; rm -rf "$BASE"
  echo "== Cluster detenido y limpiado =="
fi
[ $fail -eq 0 ]
