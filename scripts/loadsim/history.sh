#!/usr/bin/env bash
# Rellena N días trabajados antes de hoy (lunes a sábado), del más antiguo al más reciente.
# Uso: scripts/loadsim/history.sh <dias> [desde_dias_atras]
set -euo pipefail
export PGPASSWORD=postgres
DAYS=${1:?días}; FROM=${2:-1}
# LOADSIM_VARIANT=optimized: sin auditoría por cubeta (la app optimizada no la manda)
AUDIT=true; [ "${LOADSIM_VARIANT:-current}" = optimized ] && AUDIT=false
for ((i=FROM+DAYS-1; i>=FROM; i--)); do
  psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -At -c "select loadsim.gen_day((now() at time zone 'Pacific/Auckland')::date - $i, audit_per_scan => $AUDIT)"
done
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -c "vacuum analyze"
