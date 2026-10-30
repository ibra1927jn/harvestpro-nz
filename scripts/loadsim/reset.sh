#!/usr/bin/env bash
# Deja el Supabase local con las migraciones + la empresa simulada (sin histórico).
# Uso: scripts/loadsim/reset.sh [orchards] [tls_por_huerto] [runners_por_huerto] [pickers_por_tl]
set -euo pipefail
cd "$(dirname "$0")/../.."
npx supabase db reset --no-seed >/dev/null 2>&1
export PGPASSWORD=postgres
P="psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1"
$P -v orchards="${1:-3}" -v tls="${2:-4}" -v runners="${3:-3}" -v pickers_per_tl="${4:-20}" -f scripts/loadsim/sql/01_company.sql >/dev/null
cp /tmp/loadsim_accounts.csv scripts/loadsim/accounts.csv
$P -f scripts/loadsim/sql/02_history_generator.sql >/dev/null
echo "loadsim: empresa lista ($(($(wc -l < scripts/loadsim/accounts.csv) - 1)) cuentas)"
