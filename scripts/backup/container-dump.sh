#!/usr/bin/env bash
# =============================================================================
# container-dump.sh — se ejecuta DENTRO del contenedor de la base (supabase_db_*).
# Lo lanzan scripts/backup-local.sh y scripts/backup-local.ps1 (misma lógica
# para Windows y Linux); no se usa a mano.
#
#   bash container-dump.sh <carpeta de trabajo>
#   bash container-dump.sh cleanup <carpeta de trabajo>   # la borra al terminar
#
# En <carpeta>: row-counts.sql, orphans.sql y, si hay copia anterior,
# prev-counts.tsv. Deja en <carpeta>/out:
#   database.dump   pg_dump -Fc
#   row-counts.tsv  filas por tabla, EN LA MISMA INSTANTÁNEA que el dump
#   orphans.tsv     filas huérfanas por clave foránea (misma instantánea)
#   migrations.tsv  versiones de supabase_migrations.schema_migrations
#   vault.tsv       secretos de Vault que usa la app (push_project_url, push_service_role_key)
#   sanity.txt      status=ok|suspect y motivos (comparado con prev-counts.tsv)
#   server.txt      versión de PostgreSQL
#
# Instantánea: una sesión psql abre REPEATABLE READ, exporta la instantánea
# (pg_export_snapshot), hace los recuentos en esa transacción y la mantiene
# abierta mientras pg_dump --snapshot copia exactamente lo mismo. Así los
# recuentos cuadran aunque la app esté en uso (cubetas, tokens, la bandeja de
# push que pg_cron vacía cada minuto).
# =============================================================================
set -euo pipefail

if [ "${1:-}" = cleanup ]; then
  case "${2:-}" in /tmp/harvestpro_backup_*) rm -rf -- "$2"; exit 0 ;; *) echo "bad work dir" >&2; exit 1 ;; esac
fi
W="${1:?work dir}"
case "$W" in /tmp/harvestpro_backup_*) ;; *) echo "[backup] ERROR: bad work dir $W" >&2; exit 1 ;; esac
OUT="$W/out"
mkdir -p "$OUT"
# Sin NOTICEs en la salida (PowerShell 5 trataría el stderr como error)
export PGOPTIONS='-c client_min_messages=warning'
PSQL=(psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -U supabase_admin -d postgres)

log() { printf '[backup] %s\n' "$*" >&2; }

FIFO="$W/session.fifo"
rm -f "$FIFO" "$W/ready" "$W/session.log"
mkfifo "$FIFO"
"${PSQL[@]}" <"$FIFO" >"$W/session.log" 2>&1 &
SESSION=$!
exec 3>"$FIFO"

cat >&3 <<SQL
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\\o $W/snapshot.txt
SELECT pg_export_snapshot();
\\o $OUT/row-counts.tsv
\\i $W/row-counts.sql
\\o $OUT/orphans.tsv
\\i $W/orphans.sql
\\o $OUT/migrations.tsv
SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;
SELECT to_regclass('vault.decrypted_secrets') IS NOT NULL AS has_vault \\gset
\\o $OUT/vault.tsv
\\if :has_vault
SELECT name, decrypted_secret FROM vault.decrypted_secrets
WHERE name IN ('push_project_url', 'push_service_role_key') ORDER BY name;
\\endif
\\o $OUT/server.txt
SHOW server_version;
\\o
\\! touch $W/ready
SQL

# Espera a que la sesión tenga la instantánea y los recuentos (o muera)
for _ in $(seq 1 600); do
  [ -f "$W/ready" ] && break
  kill -0 "$SESSION" 2>/dev/null || break
  sleep 0.2
done
if [ ! -f "$W/ready" ]; then
  exec 3>&-
  wait "$SESSION" || true
  cat "$W/session.log" >&2
  log "ERROR: could not open the snapshot session"
  exit 1
fi
SNAP="$(tr -d '[:space:]' <"$W/snapshot.txt")"

status=0
pg_dump -U supabase_admin -d postgres -Fc --snapshot="$SNAP" -f "$OUT/database.dump" || status=$?
printf 'COMMIT;\n\\q\n' >&3
exec 3>&-
wait "$SESSION" || status=$?
if [ "$status" != 0 ] || [ ! -s "$OUT/database.dump" ]; then
  cat "$W/session.log" >&2
  log "ERROR: pg_dump failed"
  exit 1
fi

# ── Comprobación de la copia antes de que la rotación borre las viejas ──────
count_of() { awk -F'\t' -v t="$1" '$1 == t { print $2 }' "$2"; }
reasons=()
for t in public.users public.orchards; do
  n="$(count_of "$t" "$OUT/row-counts.tsv")"
  [ "${n:-0}" -gt 0 ] || reasons+=("$t is empty")
done
if [ -f "$W/prev-counts.tsv" ]; then
  for t in auth.users public.users public.orchards public.pickers public.bucket_records public.daily_attendance; do
    now="$(count_of "$t" "$OUT/row-counts.tsv")"; prev="$(count_of "$t" "$W/prev-counts.tsv")"
    now="${now:-0}"; prev="${prev:-0}"
    # Más de la mitad menos que en la copia anterior: algo ha pasado
    if [ "$prev" -gt 0 ] && [ $((now * 2)) -lt "$prev" ]; then
      reasons+=("$t dropped from $prev to $now rows since the previous backup")
    fi
  done
fi
{
  if [ ${#reasons[@]} -eq 0 ]; then echo 'status=ok'; else echo 'status=suspect'; printf 'reason=%s\n' "${reasons[@]}"; fi
} >"$OUT/sanity.txt"
exit 0
