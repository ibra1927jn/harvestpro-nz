#!/usr/bin/env bash
# =============================================================================
# backup-local.sh — copia de seguridad del Supabase local (Docker).
#
# Hace pg_dump DENTRO del contenedor de la base (mismo pg_dump que el servidor,
# sin instalar PostgreSQL en el PC), lo saca a una carpeta con fecha y guarda
# también los archivos de Storage (documentos de RRHH) y un recuento de filas
# por tabla para comprobar luego la restauración. Conserva las 14 últimas.
#
# Solo lee: no para ni toca la base.
#
# Uso:
#   scripts/backup-local.sh                         # a ./backups
#   BACKUP_DIR=/ruta KEEP=14 scripts/backup-local.sh
#   DB_CONTAINER=supabase_db_otro scripts/backup-local.sh
#
# Versión Windows (la del PC del dueño): scripts/backup-local.ps1
# Restaurar / comprobar: scripts/restore-local.sh  ·  Guía: docs/backups-local.md
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP="${KEEP:-14}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

log() { printf '[backup] %s\n' "$*" >&2; }
die() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker is required"
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || die "KEEP must be a positive number"

# Contenedor de la base: DB_CONTAINER, o el único supabase_db_* en marcha
# (si hay varios, el de este proyecto: supabase_db_harvestpro-nz)
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

psql_in() { docker exec "$DB" psql -X -q -At -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
psql_in -c 'select 1' >/dev/null || die "database in $DB is not answering"

TARGET="$BACKUP_DIR/harvestpro_$STAMP"
PARTIAL="$TARGET.partial"
mkdir -p "$PARTIAL"
TMP_IN="/tmp/harvestpro_backup_$STAMP.dump"
cleanup() { docker exec "$DB" rm -f "$TMP_IN" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "Dumping database from $DB"
# Formato custom (-Fc): comprimido y restaurable por partes (pg_restore)
docker exec "$DB" pg_dump -U supabase_admin -d postgres -Fc -f "$TMP_IN"
docker cp "$DB:$TMP_IN" "$PARTIAL/database.dump" >/dev/null
[ -s "$PARTIAL/database.dump" ] || die "empty dump"

# Recuento de filas de las tablas con datos de la app (public, auth, storage)
docker exec -i "$DB" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  <"$ROOT/scripts/backup/row-counts.sql" >"$PARTIAL/row-counts.tsv"

# Archivos de Storage (los documentos están en el volumen del contenedor, no en la base)
if docker inspect "$STORAGE" >/dev/null 2>&1; then
  log "Copying Storage files from $STORAGE"
  docker cp "$STORAGE:/mnt/." "$PARTIAL/storage" >/dev/null
else
  log "No Storage container $STORAGE: skipping files"
fi

{
  echo "created_at=$(date -Iseconds)"
  echo "container=$DB"
  echo "server=$(psql_in -c 'show server_version')"
  echo "dump_bytes=$(wc -c <"$PARTIAL/database.dump" | tr -d ' ')"
  echo "tables=$(grep -c . "$PARTIAL/row-counts.tsv")"
} >"$PARTIAL/manifest.txt"

# Solo una copia completa lleva el nombre definitivo
mv "$PARTIAL" "$TARGET"
log "Backup ready: $TARGET ($(du -sh "$TARGET" | cut -f1))"

# Rotación: guarda las KEEP más recientes (los nombres llevan la fecha, orden alfabético = cronológico)
mapfile -t ALL < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'harvestpro_????-??-??_??????' | sort)
if [ "${#ALL[@]}" -gt "$KEEP" ]; then
  for old in "${ALL[@]:0:${#ALL[@]}-KEEP}"; do
    log "Removing old backup $(basename "$old")"
    rm -rf -- "$old"
  done
fi
# Restos de copias interrumpidas de hace más de un día
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'harvestpro_*.partial' -mtime +0 -exec rm -rf -- {} + 2>/dev/null || true
echo "$TARGET"
