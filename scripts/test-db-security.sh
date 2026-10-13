#!/usr/bin/env bash
# Pruebas de seguridad de la base de datos (RLS, funciones SECURITY DEFINER, roles).
#
# Uso:   scripts/test-db-security.sh [archivo.sql ...]
# BD:    DB_URL (por defecto el Supabase local: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#
# Cada archivo de supabase/tests/security/NN_*.sql corre en una transacción con
# ROLLBACK (no deja datos). Imprime PASS/FAIL por comprobación y sale con
# código distinto de 0 si alguna falla o si un archivo da error.
set -u

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/tests/security"

if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  FILES=()
  for f in "$DIR"/[0-9][0-9]_*.sql; do
    case "$(basename "$f")" in 00_*) continue ;; esac
    FILES+=("$f")
  done
fi

total=0
failed=0
broken=0

for f in "${FILES[@]}"; do
  echo "── $(basename "$f")"
  out="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1)"
  rc=$?
  while IFS= read -r line; do
    case "$line" in
      PASS*) total=$((total + 1)); echo "  $line" ;;
      FAIL*) total=$((total + 1)); failed=$((failed + 1)); echo "  $line" ;;
      SUMMARY*) ;;
      "") ;;
      *) echo "  $line" ;;
    esac
  done <<< "$out"
  if [ $rc -ne 0 ]; then
    broken=$((broken + 1))
    echo "  ERROR: $(basename "$f") did not run to the end (psql exit $rc)"
  fi
done

echo
echo "DB security: $total checks, $failed failed, $broken file(s) with errors"
if [ $failed -ne 0 ] || [ $broken -ne 0 ]; then
  exit 1
fi
exit 0
