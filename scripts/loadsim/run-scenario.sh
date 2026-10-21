#!/usr/bin/env bash
# Un escenario completo: servidor de la variante + N días de histórico + el día
# de hoy en vivo + operaciones de oficina con ese volumen.
# Uso: scripts/loadsim/run-scenario.sh <nombre> <dias_historico> <current|optimized> [--chaos] [--speed N]
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=$1; DAYS=$2; VARIANT=$3; shift 3
CHAOS=""; SPEED=60
while [ $# -gt 0 ]; do
  case "$1" in
    --chaos) CHAOS="--chaos" ;;
    --speed) SPEED=$2; shift ;;
  esac
  shift
done
OUT=scripts/loadsim/results/${NAME}-${VARIANT}${CHAOS:+-chaos}
echo "== $NAME ($DAYS días de histórico, $VARIANT${CHAOS:+, caos}) $(date +%H:%M)"
scripts/loadsim/use-variant.sh "$VARIANT" >/dev/null 2>&1
t0=$(date +%s)
if [ "$DAYS" -gt 0 ]; then LOADSIM_VARIANT=$VARIANT scripts/loadsim/history.sh "$DAYS" > "$OUT.history.log" 2>&1; fi
echo "   histórico: $(( $(date +%s) - t0 ))s"
node scripts/loadsim/live-day.mjs --speed "$SPEED" --variant "$VARIANT" $CHAOS --out "$OUT.json" > "$OUT.log" 2>&1 || echo "   live-day falló (ver $OUT.log)"
CLOSE=""; [ "$DAYS" -ge 6 ] && CLOSE="--close-weeks"
node scripts/loadsim/period-ops.mjs --label "$NAME-$VARIANT" --out "$OUT.period.json" $CLOSE > "$OUT.period.log" 2>&1 || echo "   period-ops falló (ver $OUT.period.log)"
echo "   listo $(date +%H:%M)"
