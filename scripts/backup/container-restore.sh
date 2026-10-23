#!/usr/bin/env bash
# =============================================================================
# container-restore.sh — se ejecuta DENTRO del contenedor de la base. Lo lanzan
# scripts/restore-local.sh y scripts/restore-local.ps1; no se usa a mano.
#
#   bash container-restore.sh check <carpeta>   # base aparte, comprueba y la borra
#   bash container-restore.sh fresh <carpeta>   # carga los datos en la base de la app (vacía)
#   bash container-restore.sh cleanup <carpeta> # borra la carpeta de trabajo
#
# En <carpeta>: database.dump, row-counts.tsv (de la copia), vault.tsv (si la
# copia lo tiene), row-counts.sql y orphans.sql.
#
# Los dos modos validan lo mismo: los recuentos de cada tabla y las filas
# huérfanas (claves foráneas que apuntan a nada). Las huérfanas no tumban la
# comprobación: se avisan con tabla, restricción y número, para limpiarlas.
#   check: esquema y datos de la copia, sin las claves foráneas; después las
#          claves foráneas como NOT VALID (se crean aunque haya huérfanas) y la
#          consulta de huérfanas.
#   fresh: solo datos (el esquema lo pusieron las migraciones), con los
#          triggers desactivados como siempre en una carga; después la misma
#          consulta de huérfanas sobre las claves foráneas de la base.
# =============================================================================
set -euo pipefail

MODE="${1:?mode}"
W="${2:?work dir}"
case "$W" in /tmp/harvestpro_restore_*) ;; *) echo "[restore] ERROR: bad work dir $W" >&2; exit 1 ;; esac
if [ "$MODE" = cleanup ]; then rm -rf -- "$W"; exit 0; fi

CHECK_DB="${CHECK_DB:-harvestpro_restore_check}"
case "$CHECK_DB" in harvestpro_restore_*) ;; *) echo "[restore] ERROR: CHECK_DB must start with harvestpro_restore_" >&2; exit 1 ;; esac
export PGOPTIONS='-c client_min_messages=warning'
DUMP="$W/database.dump"
log() { printf '[restore] %s\n' "$*" >&2; }
sql() { local db="$1"; shift; psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -U supabase_admin -d "$db" "$@"; }
# Tras una carga grande la base puede tardar en aceptar conexiones (p. ej. si se reinicia)
wait_db() {
  for _ in $(seq 1 60); do
    psql -X -q -At -U supabase_admin -d "$1" -c 'select 1' >/dev/null 2>&1 && return 0
    sleep 2
  done
  log "ERROR: database $1 is not answering"; return 1
}

# Recuentos: compara con la copia (solo las tablas que se cargaron)
compare_counts() {
  local db="$1" expected="$2" now
  now="$(sql "$db" <"$W/row-counts.sql")"
  if ! diff <(sort "$expected") <(sort <<<"$now") >"$W/count-diff.txt"; then
    # Tablas que existen solo en un lado (copia de otra versión del esquema) no cuentan como diferencia
    local real
    real="$(awk -F'\t' 'NR==FNR { want[$1]=$2; next } ($1 in want) && want[$1] != $2 { print $1 "\t" want[$1] "\t" $2 }' \
      "$expected" <(printf '%s\n' "$now"))"
    if [ -n "$real" ]; then
      log "Row counts differ (table, backup, restored):"
      printf '%s\n' "$real" >&2
      return 1
    fi
  fi
  log "Row counts match: $(grep -c . "$expected") tables, $(awk -F'\t' '{s+=$2} END {print s+0}' "$expected") rows"
}

report_orphans() {
  local db="$1" rows
  rows="$(sql "$db" <"$W/orphans.sql")"
  printf '%s\n' "$rows" | grep . >"$W/orphans.tsv" || true
  if [ -s "$W/orphans.tsv" ]; then
    log "WARNING: orphan rows (foreign keys that point to nothing). The data is restored as it was in the backup;"
    log "clean them in the app database before they block a restore of a future backup:"
    while IFS=$'\t' read -r child cols parent n con; do
      log "  $child: $n row(s) whose ($cols) is not in $parent  [$con]"
    done <"$W/orphans.tsv"
    log "  List them with: SELECT * FROM <table> c WHERE NOT EXISTS (SELECT 1 FROM <parent> p WHERE p.id = c.<column>);"
  else
    log "No orphan rows"
  fi
}

if [ "$MODE" = check ]; then
  [ "$(sql postgres -c "select count(*) from pg_database where datname = '$CHECK_DB'")" = 0 ] \
    || { log "ERROR: database $CHECK_DB already exists (a previous check with --keep?). Drop it first."; exit 1; }
  sql postgres -c "create database $CHECK_DB"
  status=0
  {
    # pg_cron solo vive en la base postgres; las claves foráneas van aparte (NOT VALID)
    pg_restore -l "$DUMP" | grep -v -E ' cron | pg_cron ' >"$W/all.list"
    grep -v ' FK CONSTRAINT ' "$W/all.list" >"$W/nofk.list"
    grep ' FK CONSTRAINT ' "$W/all.list" >"$W/fk.list" || true
    pg_restore -U supabase_admin -d "$CHECK_DB" --exit-on-error -L "$W/nofk.list" "$DUMP"
    if [ -s "$W/fk.list" ]; then
      pg_restore -f - -L "$W/fk.list" "$DUMP" | sed -E 's/;[[:space:]]*$/ NOT VALID;/; s/^(SET|SELECT) (.*) NOT VALID;$/\1 \2;/' \
        | sql "$CHECK_DB" >/dev/null
    fi
    compare_counts "$CHECK_DB" "$W/row-counts.tsv"
    report_orphans "$CHECK_DB"
  } || status=$?
  if [ "${KEEP_DB:-0}" = 1 ]; then
    log "Kept database $CHECK_DB (drop it with: DROP DATABASE $CHECK_DB)"
  else
    sql postgres -c "drop database $CHECK_DB"
  fi
  exit "$status"
fi

[ "$MODE" = fresh ] || { log "ERROR: unknown mode $MODE"; exit 1; }

users="$(sql postgres -c 'select count(*) from auth.users')"
orchards="$(sql postgres -c 'select count(*) from public.orchards')"
if [ "$users" != 0 ] || [ "$orchards" != 0 ]; then
  log "ERROR: the database already has data ($users users, $orchards orchards). --fresh-stack only loads into a new, empty Supabase."
  exit 1
fi

# Solo datos de public, auth y storage, sin las tablas de versiones de auth y storage
pg_restore -l "$DUMP" | grep -E '(TABLE DATA|SEQUENCE SET) (public|auth|storage) ' \
  | grep -v -E ' auth schema_migrations | storage migrations ' >"$W/data.list"
# Tablas de la copia que este esquema ya no tiene (una migración las borró): se saltan y se avisa
: >"$W/skipped.txt"
: >"$W/data.ok.list"
while IFS= read -r line; do
  read -r _ _ _ kind1 kind2 schema name _ <<<"$line"
  if [ "$kind1 $kind2" = "TABLE DATA" ] && [ "$(sql postgres -c "select to_regclass('$schema.\"$name\"') is null")" = t ]; then
    printf '%s.%s\n' "$schema" "$name" >>"$W/skipped.txt"
    continue
  fi
  printf '%s\n' "$line" >>"$W/data.ok.list"
done <"$W/data.list"
if [ -s "$W/skipped.txt" ]; then
  log "WARNING: tables in the backup that this schema no longer has (data NOT loaded):"
  sed 's/^/  /' "$W/skipped.txt" >&2
fi

# Las migraciones dejan algunas filas (p. ej. buckets de Storage): se vacían, la copia trae las suyas
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
log "Loading data"
pg_restore -U supabase_admin -d postgres --data-only --disable-triggers --single-transaction --exit-on-error \
  -L "$W/data.ok.list" "$DUMP"

# Recuentos solo de lo que se cargó (sin las tablas de control de versiones)
{ printf 'auth.schema_migrations\nstorage.migrations\n'; cat "$W/skipped.txt"; } >"$W/not-loaded.txt"
awk -F'\t' 'NR==FNR { skip[$1]=1; next } !skip[$1]' "$W/not-loaded.txt" "$W/row-counts.tsv" >"$W/expected-counts.tsv"
status=0
wait_db postgres
compare_counts postgres "$W/expected-counts.tsv" || status=1
wait_db postgres
report_orphans postgres || status=1
wait_db postgres

# Secretos de Vault para despertar send-push desde pg_cron
if [ -s "$W/vault.tsv" ]; then
  while IFS=$'\t' read -r name value; do
    exists="$(sql postgres -c "select count(*) from vault.secrets where name = '$name'")"
    if [ "$exists" = 0 ]; then
      # Por stdin: psql no sustituye variables en -c
      printf "select vault.create_secret(:'value', :'name');\n" | sql postgres -v name="$name" -v value="$value" >/dev/null
      log "Vault secret $name restored from the backup"
    fi
  done <"$W/vault.tsv"
fi
missing="$(sql postgres -c "select string_agg(n, ', ') from unnest(array['push_project_url', 'push_service_role_key']) n
  where to_regclass('vault.secrets') is null or not exists (select 1 from vault.secrets s where s.name = n)")"
if [ -n "$missing" ]; then
  log "WARNING: ******************************************************************"
  log "WARNING: Vault secret(s) missing: $missing"
  log "WARNING: push notifications will NOT be woken by pg_cron until you add them"
  log "WARNING: (docs/push-notifications.md, section pg_cron)."
  log "WARNING: ******************************************************************"
fi
exit "$status"
