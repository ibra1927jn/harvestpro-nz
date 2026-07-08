#!/usr/bin/env bash
# SessionStart hook — prepara el entorno para que Claude Code pueda correr
# tests, lint y build desde el primer turno (util en sesiones web/frescas).
# Idempotente: seguro de re-ejecutar. No falla la sesion si algo no esta listo.
set -uo pipefail

# Raiz del repo (el hook puede lanzarse desde cualquier cwd).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 0

echo "[harvestpro-nz] SessionStart: preparando entorno..."

# 1) Env placeholders que los tests/build necesitan (mismos valores que ci.yml).
#    Solo se fijan si no vienen ya definidos desde fuera.
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://placeholder.supabase.co}"
export VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder-key-for-tests-only}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"

# 2) Dependencias: instalar solo si faltan.
if [ ! -d "node_modules" ]; then
  echo "[harvestpro-nz] node_modules ausente -> npm ci --ignore-scripts (sin husky)"
  # --ignore-scripts evita disparar el prepare de husky durante el bootstrap.
  npm ci --ignore-scripts >/dev/null 2>&1 \
    && echo "[harvestpro-nz] dependencias instaladas" \
    || echo "[harvestpro-nz] AVISO: 'npm ci' fallo; instala manualmente si hace falta"
else
  echo "[harvestpro-nz] node_modules presente (ok)"
fi

# 3) Recordatorio de comandos clave (verification loop).
cat <<'EOF'
[harvestpro-nz] Entorno listo. Comandos de verificacion:
  npm run lint     # ESLint, 0 warnings permitidos
  npm test         # Vitest (heap 4GB, jsdom, fake-indexeddb)
  npm run build    # tsc + vite build
  Skill /verify    # corre la secuencia completa como "definition of done"
EOF

exit 0
