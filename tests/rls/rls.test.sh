#!/usr/bin/env bash
# Tests de comportamiento RLS contra el schema REAL (todas las migraciones).
# Afirman el comportamiento SEGURO deseado. Hoy varios salen ROJO: reproducen
# los bugs confirmados por /rls-check. Tras las migraciones de correccion deben
# pasar a VERDE. Ese es el loop de verificacion para cambios de base de datos.
#
# Uso:  bash tests/rls/rls.test.sh
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
SOCK=/tmp/harvestpro-rls/sock

echo "== Levantando schema real (shim + 60 migraciones) =="
if ! bash "$REPO/tests/rls/boot.sh" --keep >/tmp/rls-boot.log 2>&1; then
  echo "FALLO el boot/migraciones:"; tail -8 /tmp/rls-boot.log; exit 1
fi
grep "Resultado:" /tmp/rls-boot.log | sed 's/^/   /'

P() { sudo -u postgres "$PGBIN/psql" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

# UUIDs fijos (deterministas)
O=11111111-1111-1111-1111-111111111111
MGR=22222222-2222-2222-2222-222222222222
RUN=33333333-3333-3333-3333-333333333333
PK=44444444-4444-4444-4444-444444444444
BK=55555555-5555-5555-5555-555555555555

P >/dev/null <<SQL
INSERT INTO public.orchards(id,name) VALUES ('$O','Test Orchard') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id,email) VALUES ('$MGR','m@x'),('$RUN','r@x') ON CONFLICT DO NOTHING;
INSERT INTO public.users(id,email,full_name,role,orchard_id,is_active) VALUES
 ('$MGR','m@x','Mgr','manager','$O',true),('$RUN','r@x','Run','runner','$O',true) ON CONFLICT DO NOTHING;
INSERT INTO public.pickers(id,picker_id,name,orchard_id) VALUES ('$PK','P001','Pk','$O') ON CONFLICT DO NOTHING;
INSERT INTO public.harvest_settings(orchard_id,piece_rate,min_wage_rate) VALUES ('$O',1.00,23.95)
  ON CONFLICT (orchard_id) DO UPDATE SET piece_rate=1.00;
SQL

reseed_bucket() { P >/dev/null -c "DELETE FROM public.bucket_records WHERE id='$BK'; INSERT INTO public.bucket_records(id,orchard_id,picker_id,scanned_at) VALUES ('$BK','$O','$PK',now());"; }
as() { local uid="$1" sql="$2"; P >/dev/null <<SQL 2>/dev/null || true
SET ROLE authenticated;
SET request.jwt.claim.sub = '$uid';
$sql
SQL
}

fails=0
check() { # desc  actual  expected
  if [ "$2" = "$3" ]; then echo "  OK  $1"; else echo "  XX  $1  (esperado=$3 real=$2)"; fails=$((fails+1)); fi
}

echo "== Assertions de seguridad (deseado). ROJO hoy = bug reproducido =="

# 1) runner NO debe poder borrar el ledger de paga
reseed_bucket
as "$RUN" "DELETE FROM public.bucket_records WHERE id='$BK';"
check "runner NO puede DELETE bucket_records (ledger)" "$(P -c "select count(*) from bucket_records where id='$BK';")" "1"

# 2) runner NO debe poder modificar el ledger (reasignar picker = manipular paga)
reseed_bucket
as "$RUN" "UPDATE public.bucket_records SET picker_id='$PK', quality_grade='premium' WHERE id='$BK';"
check "runner NO puede UPDATE bucket_records" "$(P -c "select coalesce(quality_grade,'none') from bucket_records where id='$BK';")" "none"

# 3) runner NO debe poder cambiar la tarifa de pago
as "$RUN" "UPDATE public.harvest_settings SET piece_rate=999 WHERE orchard_id='$O';"
check "runner NO puede UPDATE harvest_settings.piece_rate" "$(P -c "select piece_rate from harvest_settings where orchard_id='$O';")" "1.00"

# 4) CONTROL: manager SI debe poder borrar (que el fix no sea sobre-restrictivo)
reseed_bucket
as "$MGR" "DELETE FROM public.bucket_records WHERE id='$BK';"
check "manager SI puede DELETE bucket_records (control)" "$(P -c "select count(*) from bucket_records where id='$BK';")" "0"

echo "== $((4-fails))/4 OK =="
sudo -u postgres "$PGBIN/pg_ctl" -D /tmp/harvestpro-rls/data -w stop >/dev/null 2>&1; rm -rf /tmp/harvestpro-rls
[ $fails -eq 0 ]
