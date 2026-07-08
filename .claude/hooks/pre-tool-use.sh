#!/usr/bin/env bash
# PreToolUse hook — guarda determinista que refuerza SECURITY_RULES.md a nivel
# sistema (no depende de que el modelo "recuerde" las reglas).
# Bloquea con exit 2 y explica el motivo por stderr (Claude lo lee y corrige).
set -uo pipefail

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

block() {
  echo "BLOCKED por harness (ver SECURITY_RULES.md): $1" >&2
  exit 2
}

case "$tool" in
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

    # 1) git push directo a main/master (solo se trabaja en ramas de feature).
    if printf '%s' "$cmd" | grep -qiE 'git[[:space:]]+.*push'; then
      if printf '%s' "$cmd" | grep -qiE '(^|[[:space:]])(origin[[:space:]]+)?(main|master)([[:space:]:]|$)'; then
        block "git push a main/master no permitido. Usa la rama de feature designada."
      fi
      if printf '%s' "$cmd" | grep -qiE '(--force([[:space:]=]|$)|(^|[[:space:]])-[a-zA-Z]*f)'; then
        block "git push --force no permitido desde el harness."
      fi
    fi

    # 2) rm -rf sobre rutas peligrosas (raiz, home, cwd, wildcard).
    if printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]'; then
      if printf '%s' "$cmd" | grep -qE 'rm[[:space:]]+-[a-zA-Z]*[[:space:]]+(-[a-zA-Z]+[[:space:]]+)?(/|~|\.|\*|\$HOME|\$\{HOME\})([[:space:]]|/|$)'; then
        block "rm -rf sobre ruta peligrosa (/, ~, ., *). Especifica una ruta concreta."
      fi
    fi
    ;;

  Write|Edit|MultiEdit)
    fp=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    [ -z "$fp" ] && exit 0

    # 3) Nunca escribir archivos de entorno con secretos.
    case "$fp" in
      *.env|*.env.local|*/.env|*/.env.local|*.env.production|*.env.*.local)
        block "Escritura a archivos .env no permitida (secretos). Usa .env.example." ;;
    esac

    # 4) No modificar migraciones EXISTENTES (crear nuevas si esta permitido).
    if printf '%s' "$fp" | grep -qE 'supabase/migrations/'; then
      if [ -f "$fp" ]; then
        block "No modificar migraciones existentes. Crea una migracion nueva (skill /new-migration)."
      fi
    fi
    ;;
esac

exit 0
