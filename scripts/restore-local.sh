#!/usr/bin/env bash
# =============================================================================
# restore-local.sh — restaura una copia hecha con backup-local.(sh|ps1).
#
#   check (por defecto) — prueba la copia SIN tocar la base de la app: la
#     restaura en una base aparte (harvestpro_restore_check), compara el
#     recuento de cada tabla con el de la copia (misma instantánea que el
#     dump), avisa de filas huérfanas y borra esa base.
#       scripts/restore-local.sh backups/harvestpro_2026-10-24_020000
#       scripts/restore-local.sh <copia> --keep        # deja la base para mirarla
#
#   fresh-stack — recuperación tras perder el PC o el volumen de Docker: en un
#     Supabase local NUEVO (supabase start, sin datos) carga los datos de
#     public, auth y storage, los archivos de Storage y los secretos de Vault.
#     Se niega si la base ya tiene usuarios o huertos.
#       scripts/restore-local.sh <copia> --fresh-stack
#     Si la copia es de un esquema anterior (migraciones más viejas que las
#     del checkout), primero deja la base en la versión de la copia
#     (supabase db reset --version), carga los datos y después aplica las
#     migraciones que faltan (supabase migration up). Necesita la CLI de
#     Supabase (SUPABASE_BIN, `supabase` o `npx supabase`).
#
# Variables: DB_CONTAINER (def. el único supabase_db_* en marcha),
# STORAGE_CONTAINER, CHECK_DB (def. harvestpro_restore_check), SUPABASE_BIN.
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
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    -*) die "unknown option $arg" ;;
    *) SRC="$arg" ;;
  esac
done
[ -n "$SRC" ] || die "usage: restore-local.sh <backup folder> [--keep | --fresh-stack]"
[ -f "$SRC/database.dump" ] && [ -f "$SRC/row-counts.tsv" ] || die "$SRC is not a backup folder (database.dump + row-counts.tsv)"
SRC="$(cd "$SRC" && pwd)"
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
W="/tmp/harvestpro_restore_$$"
q() { docker exec -e PGOPTIONS='-c client_min_messages=warning' "$DB" psql -X -q -At -U supabase_admin -d postgres -c "$1"; }

stage() {
  docker exec "$DB" mkdir -p "$W"
  for f in container-restore.sh row-counts.sql orphans.sql; do docker cp "$ROOT/scripts/backup/$f" "$DB:$W/$f" >/dev/null; done
  docker cp "$SRC/database.dump" "$DB:$W/database.dump" >/dev/null
  docker cp "$SRC/row-counts.tsv" "$DB:$W/row-counts.tsv" >/dev/null
  if [ -f "$SRC/secrets/vault.tsv" ]; then docker cp "$SRC/secrets/vault.tsv" "$DB:$W/vault.tsv" >/dev/null; fi
}
cleanup() { docker exec "$DB" bash "$W/container-restore.sh" cleanup "$W" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ "$MODE" = check ]; then
  stage
  log "Restoring into separate database $CHECK_DB (the app database is not touched)"
  docker exec -e CHECK_DB="$CHECK_DB" -e KEEP_DB="$KEEP" "$DB" bash "$W/container-restore.sh" check "$W" \
    || die "restore check FAILED"
  [ -d "$SRC/storage" ] && log "Storage files in backup: $(find "$SRC/storage" -type f | wc -l | tr -d ' ')"
  log "Restore check OK"
  exit 0
fi

# ── fresh-stack ─────────────────────────────────────────────────────────────
[ "$(q 'select count(*) from auth.users')" = 0 ] && [ "$(q 'select count(*) from public.orchards')" = 0 ] \
  || die "the database already has data. --fresh-stack only loads into a new, empty Supabase."

supabase_cli() {
  if [ -n "${SUPABASE_BIN:-}" ]; then "$SUPABASE_BIN" "$@"
  elif command -v supabase >/dev/null; then supabase "$@"
  else npx --yes supabase "$@"; fi
}

# Versión del esquema: la de la copia frente a la de esta base y a las migraciones del checkout
MIGRATED_DOWN=0
if [ -s "$SRC/migrations.tsv" ]; then
  backup_max="$(sort "$SRC/migrations.tsv" | tail -1)"
  local_versions="$(find "$ROOT/supabase/migrations" -maxdepth 1 -name '*.sql' -printf '%f\n' | sed 's/_.*//' | sort)"
  missing_here="$(comm -23 <(sort "$SRC/migrations.tsv") <(printf '%s\n' "$local_versions"))"
  [ -z "$missing_here" ] || die "the backup has migrations this checkout does not have ($(echo $missing_here)). Update the project (git pull) and try again."
  target_max="$(q 'select max(version) from supabase_migrations.schema_migrations')"
  if [[ "$target_max" > "$backup_max" ]]; then
    log "The backup is from schema $backup_max; this database is at $target_max."
    log "Resetting the empty database to $backup_max, then loading, then applying the newer migrations"
    (cd "$ROOT" && supabase_cli db reset --local --no-seed --version "$backup_max")
    for _ in $(seq 1 60); do q 'select 1' >/dev/null 2>&1 && break; sleep 2; done
    MIGRATED_DOWN=1
  fi
else
  log "WARNING: old backup without migrations.tsv: loading into the current schema as is"
fi

stage
status=0
docker exec "$DB" bash "$W/container-restore.sh" fresh "$W" || status=$?
if [ -d "$SRC/storage" ] && docker inspect "$STORAGE" >/dev/null 2>&1; then
  docker cp "$SRC/storage/." "$STORAGE:/mnt/" >/dev/null
  log "Storage files copied back to $STORAGE"
fi
[ "$status" = 0 ] || die "data loaded but the check found problems (above)"

if [ "$MIGRATED_DOWN" = 1 ]; then
  log "Applying the migrations newer than the backup"
  (cd "$ROOT" && supabase_cli migration up --local)
fi

# Secretos fuera de la base: se reponen solo si faltan en este checkout
for pair in 'env.local:.env.local' 'functions.env:supabase/functions/.env'; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if [ -f "$SRC/secrets/$src" ] && [ ! -f "$ROOT/$dst" ]; then
    cp "$SRC/secrets/$src" "$ROOT/$dst"
    log "Restored $dst from the backup (restart Supabase / the dev server to pick it up)"
  elif [ ! -f "$ROOT/$dst" ]; then
    log "WARNING: $dst is missing and the backup has no copy: see .env.example / docs/push-notifications.md"
  fi
done
log "Fresh-stack restore OK"
