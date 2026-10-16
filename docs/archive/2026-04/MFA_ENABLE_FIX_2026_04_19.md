# FIX 3 — Enable MFA server-side (Supabase GoTrue)

**Audit finding:** CRITICAL — App código en `src/hooks/useMFA.ts` llama a
`supabase.auth.mfa.enroll/challenge/verify`, pero las variables `GOTRUE_MFA_*`
están comentadas en la config de Supabase self-hosted. El enroll falla
silenciosamente y los usuarios creen estar protegidos.

**Target de este fix:** Habilitar TOTP (Time-based One-Time Password, Google
Authenticator / Authy) en el servidor Supabase. Phone MFA se queda off
(requiere SMS provider pagado).

**NO APPLY AUTOMÁTICO.** Este documento sólo describe los diffs. El operador
debe aplicarlos manualmente y reiniciar.

---

## Archivos afectados

1. `/opt/supabase/supabase/docker/.env`
2. `/opt/supabase/supabase/docker/docker-compose.yml`

---

## Diff exacto — `/opt/supabase/supabase/docker/.env`

```diff
 # Multi-factor authentication (MFA)
 # Uncomment to change MFA defaults.
 # You must ALSO uncomment the matching GOTRUE_MFA_* lines in docker-compose.yml

 # App Authenticator (TOTP) - enabled by default
-# MFA_TOTP_ENROLL_ENABLED=true
-# MFA_TOTP_VERIFY_ENABLED=true
+MFA_TOTP_ENROLL_ENABLED=true
+MFA_TOTP_VERIFY_ENABLED=true

 # Phone MFA - disabled by default (opt-in)
 # MFA_PHONE_ENROLL_ENABLED=false
 # MFA_PHONE_VERIFY_ENABLED=false

-# Maximum MFA factors a user can enroll
-# MFA_MAX_ENROLLED_FACTORS=10
+# Maximum MFA factors a user can enroll
+MFA_MAX_ENROLLED_FACTORS=10
```

Phone MFA se deja off — requiere Twilio o provider SMS; cada factor cuesta
~$0.02 USD. TOTP es gratis (client-side token).

---

## Diff exacto — `/opt/supabase/supabase/docker/docker-compose.yml`

```diff
       # Uncomment to configure multi-factor authentication (MFA).
-      # GOTRUE_MFA_TOTP_ENROLL_ENABLED: ${MFA_TOTP_ENROLL_ENABLED}
-      # GOTRUE_MFA_TOTP_VERIFY_ENABLED: ${MFA_TOTP_VERIFY_ENABLED}
+      GOTRUE_MFA_TOTP_ENROLL_ENABLED: ${MFA_TOTP_ENROLL_ENABLED}
+      GOTRUE_MFA_TOTP_VERIFY_ENABLED: ${MFA_TOTP_VERIFY_ENABLED}
       # GOTRUE_MFA_PHONE_ENROLL_ENABLED: ${MFA_PHONE_ENROLL_ENABLED}
       # GOTRUE_MFA_PHONE_VERIFY_ENABLED: ${MFA_PHONE_VERIFY_ENABLED}
-      # GOTRUE_MFA_MAX_ENROLLED_FACTORS: ${MFA_MAX_ENROLLED_FACTORS}
+      GOTRUE_MFA_MAX_ENROLLED_FACTORS: ${MFA_MAX_ENROLLED_FACTORS}
```

Ubicación: debería estar dentro del servicio `auth:` (GoTrue). Buscar la
sección con otras `GOTRUE_*` vars; las líneas MFA están ya definidas pero
comentadas.

---

## Aplicar

```bash
cd /opt/supabase/supabase/docker

# 1. Editar .env
nano .env   # aplicar diff arriba

# 2. Editar docker-compose.yml
nano docker-compose.yml   # aplicar diff arriba

# 3. Recrear el contenedor auth con la nueva config
#    (--no-deps evita tocar otros servicios)
docker compose -f docker-compose.yml -f docker-compose.pg17.yml up -d --no-deps --force-recreate auth

# 4. Verificar que arrancó sin errores
docker logs supabase-auth --tail 30

# 5. Health check auth
curl -s http://127.0.0.1:8000/auth/v1/settings -H "apikey: $(grep ANON_KEY /root/.supabase-credentials.txt | cut -d= -f2)" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('mfa_totp_enroll_enabled:', d.get('mfa_totp_enroll_enabled', 'not_exposed'))"
```

Si todo OK, el endpoint `/auth/v1/factors` responderá a requests de enroll.

---

## Verificación post-fix

### 1. Endpoint health

```bash
# Debe devolver 200 con flags mfa_totp_* = true
curl -s -H "apikey: $(grep ANON_KEY /root/.supabase-credentials.txt | cut -d= -f2)" \
  http://127.0.0.1:8000/auth/v1/settings
```

### 2. Enroll desde código app

Llamar desde la UI:
```ts
import { useMFA } from '@/hooks/useMFA';
const { setupMFA } = useMFA();
const result = await setupMFA('Test Device');
// Debe devolver { qr, secret, factorId } sin error.
```

Si MFA sigue sin habilitarse, el error típico es:
- `MFA feature is not enabled` → env var no leída; revisar que docker compose
  se reinició con `--force-recreate`.
- `Unauthorized` → JWT issue, no MFA issue.

### 3. Test e2e completo (enroll → verify → login)

Ver `e2e/mfa-flow.spec.ts` en este mismo commit.

---

## Rollback plan

Si al habilitar MFA algún flujo se rompe (e.g. session manager falla por
requerir AAL2 en checks que no lo tienen):

```bash
cd /opt/supabase/supabase/docker

# 1. Volver a comentar las 3 líneas en .env
sed -i 's/^MFA_TOTP_ENROLL_ENABLED/# MFA_TOTP_ENROLL_ENABLED/' .env
sed -i 's/^MFA_TOTP_VERIFY_ENABLED/# MFA_TOTP_VERIFY_ENABLED/' .env
sed -i 's/^MFA_MAX_ENROLLED_FACTORS/# MFA_MAX_ENROLLED_FACTORS/' .env

# 2. Volver a comentar las 3 líneas en docker-compose.yml (ajustar manualmente)
#    o usar:
sed -i 's/^      GOTRUE_MFA_TOTP_/#       GOTRUE_MFA_TOTP_/' docker-compose.yml
sed -i 's/^      GOTRUE_MFA_MAX_/#       GOTRUE_MFA_MAX_/' docker-compose.yml

# 3. Recrear contenedor auth
docker compose -f docker-compose.yml -f docker-compose.pg17.yml up -d --no-deps --force-recreate auth

# 4. Verificar que todos los usuarios pueden seguir logueando sin MFA
```

**Nota:** Si un usuario ya tenía MFA enrolled (factor_id en auth.mfa_factors)
antes del rollback, su sesión seguirá requiriendo MFA en cada login y la
verificación fallará (feature deshabilitada). En ese caso hay que eliminar
el factor vía:

```sql
-- Emergencia: unenroll masivo (requiere acceso a auth schema como superuser)
DELETE FROM auth.mfa_factors WHERE factor_type = 'totp';
```

---

## Checklist pre-release

- [ ] Applied `.env` diff (verified con `grep ^MFA_TOTP /opt/supabase/supabase/docker/.env`)
- [ ] Applied `docker-compose.yml` diff (verified con `grep GOTRUE_MFA /opt/supabase/supabase/docker/docker-compose.yml | grep -v "^#"`)
- [ ] Auth container recreated (verified con `docker inspect supabase-auth --format '{{.Created}}'`)
- [ ] `/auth/v1/settings` responde con `mfa_totp_enroll_enabled: true`
- [ ] Test e2e `e2e/mfa-flow.spec.ts` pasa localmente
- [ ] README del proyecto documenta el flujo MFA para usuarios finales
- [ ] Device trust TTL de 72h (documentado en memoria de sesiones previas) sigue funcional — necesita verification manual
