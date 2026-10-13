#!/usr/bin/env bash
# Aplica las políticas de almacenamiento (storage.objects) en el Supabase local.
# Uso: scripts/apply-storage-policies.sh [contenedor_db]
set -euo pipefail
DB_CONTAINER="${1:-supabase_db_harvestpro-nz}"
docker exec -i -e PGPASSWORD="${PGPASSWORD:-postgres}" "$DB_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < "$(dirname "$0")/../supabase/storage_policies.sql"
