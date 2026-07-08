#!/usr/bin/env bash
# PostToolUse hook — corre eslint --fix sobre el archivo TS/TSX recien editado,
# solo dentro de src/ (la app React). No bloquea el flujo si falla.
# Mantiene el codigo consistente sin depender de que se recuerde correr lint.
set -uo pipefail

input=$(cat)
fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$fp" ] && exit 0

# Solo archivos TS/TSX de la app (src/). Edge functions (Deno) y otros se omiten.
case "$fp" in
  */node_modules/*|*/dist/*) exit 0 ;;
esac
if ! printf '%s' "$fp" | grep -qE '(^|/)src/.*\.(ts|tsx)$'; then
  exit 0
fi
[ -f "$fp" ] || exit 0

# eslint --fix silencioso; no bloquea aunque queden warnings (el gate real es /verify y CI).
npx eslint --fix --report-unused-disable-directives "$fp" >/dev/null 2>&1 || true

exit 0
