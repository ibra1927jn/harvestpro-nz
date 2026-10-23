#!/usr/bin/env bash
# =============================================================================
# backup-local.sh — copia de seguridad del Supabase local (Docker).
#
# pg_dump DENTRO del contenedor de la base (mismo pg_dump que el servidor, sin
# instalar PostgreSQL), con el recuento de filas, las filas huérfanas y las
# versiones de migración tomados en la MISMA instantánea que el dump
# (scripts/backup/container-dump.sh). Guarda también los archivos de Storage y
# los secretos (Vault, .env.local, supabase/functions/.env) en secrets/.
#
# Antes de borrar copias viejas comprueba la nueva: si la base sale vacía o una
# tabla clave tiene menos de la mitad de filas que en la copia anterior, la
# guarda como .suspect, NO borra ninguna vieja y sale con error.
#
# Solo lee: no para ni toca la base.
#
# Uso:
#   scripts/backup-local.sh                          # a ./backups, guarda 14
#   BACKUP_DIR=/ruta KEEP=14 scripts/backup-local.sh
#   MIRROR_DIR=/media/usb/harvestpro scripts/backup-local.sh   # y una segunda copia allí
#   FORCE=1 scripts/backup-local.sh                  # acepta una copia "sospechosa" (base nueva vacía)
#   DB_CONTAINER=supabase_db_otro scripts/backup-local.sh
#
# Versión Windows (la del PC del dueño): scripts/backup-local.ps1
# Restaurar / comprobar: scripts/restore-local.sh  ·  Guía: docs/backups-local.md
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
MIRROR_DIR="${MIRROR_DIR:-}"
KEEP="${KEEP:-14}"
FORCE="${FORCE:-0}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

log() { printf '[backup] %s\n' "$*" >&2; }
die() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "docker is required"
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || die "KEEP must be a positive number"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

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
docker exec "$DB" psql -X -q -At -U supabase_admin -d postgres -c 'select 1' >/dev/null || die "database in $DB is not answering"

# Copias completas, de la más vieja a la más nueva (nombre con fecha: orden alfabético = cronológico)
list_backups() { find "$1" -mindepth 1 -maxdepth 1 -type d -name 'harvestpro_????-??-??_??????' | sort; }

TARGET="$BACKUP_DIR/harvestpro_$STAMP"
PARTIAL="$TARGET.partial"
mkdir -p "$PARTIAL/secrets"
W="/tmp/harvestpro_backup_$STAMP"
cleanup() { docker exec "$DB" bash "$W/container-dump.sh" cleanup "$W" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker exec "$DB" mkdir -p "$W"
for f in container-dump.sh row-counts.sql orphans.sql; do docker cp "$ROOT/scripts/backup/$f" "$DB:$W/$f" >/dev/null; done
PREV="$(list_backups "$BACKUP_DIR" | tail -1)"
[ -n "$PREV" ] && [ -f "$PREV/row-counts.tsv" ] && docker cp "$PREV/row-counts.tsv" "$DB:$W/prev-counts.tsv" >/dev/null

log "Dumping database from $DB (one snapshot for dump and counts)"
docker exec "$DB" bash "$W/container-dump.sh" "$W"
docker cp "$DB:$W/out/." "$PARTIAL" >/dev/null
[ -s "$PARTIAL/database.dump" ] || die "empty dump"
mv "$PARTIAL/vault.tsv" "$PARTIAL/secrets/vault.tsv"

# Secretos que no están en la base: claves de la app y la VAPID privada de las funciones
# (nombres sin punto delante para que se vean en el Explorador de Windows)
for pair in '.env.local:env.local' '.env:env' 'supabase/functions/.env:functions.env'; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if [ -f "$ROOT/$src" ]; then cp "$ROOT/$src" "$PARTIAL/secrets/$dst"; fi
done
chmod -R go-rwx "$PARTIAL/secrets" 2>/dev/null || true

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
  echo "server=$(cat "$PARTIAL/server.txt")"
  echo "dump_bytes=$(wc -c <"$PARTIAL/database.dump" | tr -d ' ')"
  echo "tables=$(grep -c . "$PARTIAL/row-counts.tsv")"
  echo "migration=$(tail -1 "$PARTIAL/migrations.tsv")"
} >"$PARTIAL/manifest.txt"
rm -f "$PARTIAL/server.txt"

if [ -s "$PARTIAL/orphans.tsv" ]; then
  log "WARNING: the database has orphan rows (the backup is still complete):"
  while IFS=$'\t' read -r child cols parent n con; do log "  $child: $n row(s) whose ($cols) is not in $parent  [$con]"; done <"$PARTIAL/orphans.tsv"
fi

# Copia sospechosa: no se rota nada
if ! grep -qx 'status=ok' "$PARTIAL/sanity.txt" && [ "$FORCE" != 1 ]; then
  mv "$PARTIAL" "$TARGET.suspect"
  log "ERROR: this backup looks wrong, so NO old backup was deleted:"
  sed -n 's/^reason=/  /p' "$TARGET.suspect/sanity.txt" >&2
  log "It is kept as $(basename "$TARGET.suspect"). Check the app; if the data is really like this, run again with FORCE=1."
  exit 2
fi

mv "$PARTIAL" "$TARGET"
log "Backup ready: $TARGET ($(du -sh "$TARGET" | cut -f1))"

rotate() {
  local dir="$1" all
  mapfile -t all < <(list_backups "$dir")
  if [ "${#all[@]}" -gt "$KEEP" ]; then
    for old in "${all[@]:0:${#all[@]}-KEEP}"; do
      log "Removing old backup $old"
      rm -rf -- "$old"
    done
  fi
  # Restos de copias interrumpidas de hace más de un día
  find "$dir" -mindepth 1 -maxdepth 1 -type d -name 'harvestpro_*.partial' -mtime +0 -exec rm -rf -- {} + 2>/dev/null || true
}
rotate "$BACKUP_DIR"

# Segunda copia en otro disco / USB / carpeta sincronizada
if [ -n "$MIRROR_DIR" ]; then
  if mkdir -p "$MIRROR_DIR" 2>/dev/null && cp -R "$TARGET" "$MIRROR_DIR/$(basename "$TARGET").partial" \
     && mv "$MIRROR_DIR/$(basename "$TARGET").partial" "$MIRROR_DIR/$(basename "$TARGET")"; then
    log "Second copy: $MIRROR_DIR/$(basename "$TARGET")"
    rotate "$MIRROR_DIR"
  else
    log "ERROR: could not write the second copy to $MIRROR_DIR (is the drive connected?)"
    echo "$TARGET"
    exit 3
  fi
fi
echo "$TARGET"
