# 🔐 GitHub Secrets Configuration Script

## IMPORTANTE: Ejecutar estos comandos para configurar CI/CD

### Opción 1: GitHub CLI (Recomendado)

```bash
# Install GitHub CLI si no lo tienes
# https://cli.github.com/

# Login
gh auth login

# Configurar secrets
gh secret set SENTRY_DSN --body "https://6030269dcf3cf717e7c81e07fdd695b5@o4510865202937856.ingest.de.sentry.io/4510865231446096"
gh secret set POSTHOG_KEY --body "phc_SeAU4VUwO164i2Z1jEQBQvRidlC16bKlTjhwz3zVLa8"
gh secret set POSTHOG_HOST --body "https://app.posthog.com"

# Vercel secrets (necesitas obtener estos valores)
gh secret set VERCEL_TOKEN --body "YOUR_VERCEL_TOKEN"
gh secret set VERCEL_ORG_ID --body "YOUR_ORG_ID"
gh secret set VERCEL_PROJECT_ID --body "YOUR_PROJECT_ID"

# Supabase Production
gh secret set PRODUCTION_SUPABASE_URL --body "YOUR_SUPABASE_URL"
gh secret set PRODUCTION_SUPABASE_ANON_KEY --body "YOUR_SUPABASE_ANON_KEY"

# Supabase Staging (mismo que production por ahora)
gh secret set STAGING_SUPABASE_URL --body "YOUR_SUPABASE_URL"
gh secret set STAGING_SUPABASE_ANON_KEY --body "YOUR_SUPABASE_ANON_KEY"
```

### Opción 2: Manual (GitHub Web UI)

1. Ve a: <https://github.com/ibra1927jn/MERR/settings/secrets/actions>

2. Click "New repository secret" para cada uno:

**Monitoring:**

```
Name: SENTRY_DSN
Value: https://6030269dcf3cf717e7c81e07fdd695b5@o4510865202937856.ingest.de.sentry.io/4510865231446096

Name: POSTHOG_KEY
Value: phc_SeAU4VUwO164i2Z1jEQBQvRidlC16bKlTjhwz3zVLa8

Name: POSTHOG_HOST
Value: https://app.posthog.com
```

**Vercel (obtener de Vercel dashboard):**

```
Name: VERCEL_TOKEN
Value: [obtener de https://vercel.com/account/tokens]

Name: VERCEL_ORG_ID
Value: [obtener ejecutando: vercel link]

Name: VERCEL_PROJECT_ID
Value: [obtener ejecutando: vercel link]
```

**Supabase:**

```
Name: PRODUCTION_SUPABASE_URL
Value: [tu URL de Supabase]

Name: PRODUCTION_SUPABASE_ANON_KEY
Value: [tu anon key de Supabase]

Name: STAGING_SUPABASE_URL
Value: [mismo que production]

Name: STAGING_SUPABASE_ANON_KEY
Value: [mismo que production]
```

---

## Cómo obtener Vercel credentials

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link project (ejecutar en la raíz del proyecto)
cd "c:\Users\ibrab\Downloads\app\harvestpro-nz (1)"
vercel link

# Esto te dará:
# - Vercel Org ID
# - Vercel Project ID

# Para el token:
# https://vercel.com/account/tokens
# Create token → Name: "GitHub Actions" → Create
```

---

## Verificación

Después de configurar los secrets:

1. Crear PR de prueba:

```bash
git checkout -b test/secrets-verification
git commit --allow-empty -m "test: Verify GitHub Actions secrets"
git push origin test/secrets-verification
```

1. Ver que CI ejecuta en: <https://github.com/ibra1927jn/MERR/actions>

2. Si todo OK → Merge a main → Auto-deploy a production! 🚀

---

## Estado Actual (Sprint 16 — 2026-03-16)

✅ Sentry DSN configurado en `.env.local`  
✅ PostHog Key configurado en `.env.local`  
✅ GitHub Secrets configurados (`VITE_SUPABASE_ANON_KEY` actualizado vía `gh`)  
✅ API Keys rotadas a nuevo formato Supabase (`sb_publishable_*` / `sb_secret_*`)  
⏳ Vercel credentials pendientes  
⏳ Legacy JWT keys pendientes de desactivar (Dashboard → "Disable JWT-based API keys")

---

## Notas de Seguridad

- ✅ `.env` / `.env.local` están en `.gitignore` — nunca se commitean
- ✅ DSN de Sentry es SEGURO exponer client-side (diseñado para eso)
- ✅ PostHog key es SEGURO exponer client-side (diseñado para eso)
- ⚠️ Vercel token es SENSIBLE — solo en GitHub Secrets, NUNCA en código
- ⚠️ Supabase publishable key es SEGURO (RLS protege los datos)
- 🔴 Supabase secret key (`sb_secret_*`) es SENSIBLE — solo en Edge Functions / servidor, NUNCA en frontend
- ✅ IndexedDB PII fields encriptados con AES-256 (Sprint 16)
- ✅ CSP headers activos en `index.html` (Sprint 16)

