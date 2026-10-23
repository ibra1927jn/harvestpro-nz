#!/usr/bin/env bash
# =============================================================================
# restore-local.sh — restaura una copia hecha con backup-local.(sh|ps1).
#
# Dos modos:
#
#   check (por defecto) — prueba la copia SIN tocar la base de la app:
#     la restaura en una base aparte del mismo contenedor
#     (harvestpro_restore_check), compara el recuento de filas de cada tabla
#     con el que se guardó al hacer la copia y borra esa base al terminar.
#       scripts/restore-local.sh backups/harvestpro_2026-10-24_020000
#       scripts/restore-local.sh <copia> --keep        # deja la base para mirarla
#
#   fresh-stack — recuperación tras perder el PC o el volumen de Docker:
#     en un Supabase local NUEVO (supabase start, migraciones aplicadas, sin
#     datos) carga los datos de public, auth y storage y los archivos de
#     Storage. Se niega si la base ya tiene usuarios o huertos.
#       scripts/restore-local.sh <copia> --fresh-stack
#
# Variables: DB_CONTAINER (def. el único supabase_db_* en marcha),
# STORAGE_CONTAINER, CHECK_DB (def. harvestpro_restore_check).
# Versión Windows: scripts/restore-local.ps1 · Guía: docs/backups-local.md
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log() { printf '[restore] %s\n' "$*" >&2; }
die() { printf '[restore] ERROR: %s\n' "$*" >&2; exit 1; }

SRC="" MODE=check KEEP=0
for arg in "$@"; do
  case "$arg" in
    --fresh-stack) MODE=fresh ;;
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    -*) die "unknown option $arg" ;;
    *) SRC="$arg" ;;
  esac
done
[ -n "$SRC" ] || die "usage: restore-local.sh <backup folder> [--keep | --fresh-stack]"
[ -f "$SRC/database.dump" ] && [ -f "$SRC/row-counts.tsv" ] || die "$SRC is not a backup folder (database.dump + row-counts.tsv)"
command -v docker >/dev/null || die "docker is required"

find_container() {
  if [ -n "${DB_CONTAINER:-}" ]; then echo "$DB_CONTAINER"; return; fi
  local all
  all="$(docker ps --filter 'name=^supabase_db_' --format '{{.Names}}')"
  if [ "$(grep -c . <<<"$all")" = "1" ]; then echo "$all"; return; fi
  if grep -qx 'supabase_db_harvestpro-nz' <<<"$all"; then echo 'supabase_db_harvestpro-nz'; return; fi
  die "cannot pick the database container (running: ${all:-none}). Set DB_CONTAINER."
}
DB="$(find_container)"
STORAGE="${STORAGE_CONTAINER:-${DB/supabase_db_/supabase_storage_}}"
CHECK_DB="${CHECK_DB:-harvestpro_restore_check}"
[[ "$CHECK_DB" =~ ^harvestpro_restore_[a-z0-9_]+$ ]] || die "CHECK_DB must start with harvestpro_restore_"

# supabase_admin es el superusuario de la imagen de Supabase (postgres no lo es)
sql() { local db="$1"; shift; docker exec -i "$DB" psql -X -q -At -v ON_ERROR_STOP=1 -U supabase_admin -d "$db" "$@"; }

TMP_IN="/tmp/harvestpro_restore_$$.dump"
TMP_LIST="/tmp/harvestpro_restore_$$.list"
cleanup() { docker exec "$DB" rm -f "$TMP_IN" "$TMP_LIST" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker cp "$SRC/database.dump" "$DB:$TMP_IN" >/dev/null

# Compara el recuento guardado con el de la base restaurada; sale con error si difiere
compare_counts() {
  local db="$1" now diff
  now="$(sql "$db" -F $'\t' <"$ROOT/scripts/backup/row-counts.sql")"
  diff="$(diff <(sort "$SRC/row-counts.tsv") <(sort <<<"$now") || true)"
  if [ -n "$diff" ]; then
    log "Row counts differ (< backup, > restored):"
    printf '%s\n' "$diff" >&2
    return 1
  fi
  local total
  total="$(awk -F'\t' '{s+=$2} END {print s+0}' "$SRC/row-counts.tsv")"
  log "Row counts match: $(grep -c . "$SRC/row-counts.tsv") tables, $total rows"
}

if [ "$MODE" = check ]; then
  [ "$(sql postgres -c "select count(*) from pg_database where datname = '$CHECK_DB'")" = "0" ] \
    || die "database $CHECK_DB already exists (a previous check with --keep?). Drop it first."
  log "Restoring into separate database $CHECK_DB (the app database is not touched)"
  sql postgres -c "create database $CHECK_DB" >/dev/null
  # pg_cron solo existe en la base postgres: se quitan sus entradas de la lista
  docker exec "$DB" sh -c "pg_restore -l '$TMP_IN' | grep -v -E ' cron | pg_cron ' >'$TMP_LIST'"
  status=0
  docker exec "$DB" pg_restore -U supabase_admin -d "$CHECK_DB" --exit-on-error -L "$TMP_LIST" "$TMP_IN" || status=$?
  [ "$status" = 0 ] && { compare_counts "$CHECK_DB" || status=$?; }
  if [ "$KEEP" = 1 ]; then
    log "Kept database $CHECK_DB (drop it with: docker exec $DB psql -U supabase_admin -d postgres -c 'drop database $CHECK_DB')"
  else
    sql postgres -c "drop database $CHECK_DB" >/dev/null
  fi
  [ "$status" = 0 ] || die "restore check FAILED"
  [ -d "$SRC/storage" ] && log "Storage files in backup: $(find "$SRC/storage" -type f | wc -l | tr -d ' ')"
  log "Restore check OK"
  exit 0
fi

# ── fresh-stack ─────────────────────────────────────────────────────────────
users="$(sql postgres -c 'select count(*) from auth.users')"
orchards="$(sql postgres -c 'select count(*) from public.orchards')"
[ "$users" = 0 ] && [ "$orchards" = 0 ] \
  || die "the database already has data ($users users, $orchards orchards). --fresh-stack only loads into a new, empty Supabase."

# Solo los datos (el esquema lo crean las migraciones) de public, auth y storage,
# sin las tablas de control de versiones de auth y storage
docker exec "$DB" sh -c "pg_restore -l '$TMP_IN' \
  | grep -E '(TABLE DATA|SEQUENCE SET) (public|auth|storage) ' \
  | grep -v -E ' auth schema_migrations | storage migrations ' >'$TMP_LIST'"
# Las migraciones dejan algunas filas (p. ej. buckets de Storage): se vacían
# antes, la copia trae las suyas
log "Emptying rows created by the migrations"
sql postgres <<'SQL'
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname IN ('public', 'auth', 'storage')
             AND (n.nspname, c.relname) NOT IN (('auth', 'schema_migrations'), ('storage', 'migrations')) LOOP
    EXECUTE format('TRUNCATE %I.%I CASCADE', r.nspname, r.relname);
  END LOOP;
END $$;
SQL
log "Loading data into $DB"
docker exec "$DB" pg_restore -U supabase_admin -d postgres --data-only --disable-triggers \
  --single-transaction --exit-on-error -L "$TMP_LIST" "$TMP_IN"
compare_counts postgres || die "restore finished but row counts differ"
if [ -d "$SRC/storage" ] && docker inspect "$STORAGE" >/dev/null 2>&1; then
  docker cp "$SRC/storage/." "$STORAGE:/mnt/" >/dev/null
  log "Storage files copied back to $STORAGE"
fi
log "Fresh-stack restore OK"
