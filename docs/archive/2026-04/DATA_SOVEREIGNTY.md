# Data Sovereignty — HarvestPro NZ
**Last updated:** 21 March 2026

## Current Situation

The HarvestPro NZ Supabase project (`mcbtyaebetzvzvnxydpy`) is hosted in:

> **Region:** AWS `us-east-1` (North Virginia, USA)

This is the default region for new Supabase projects. For New Zealand customers — especially those employing RSE scheme workers — this raises data residency concerns.

---

## NZ Privacy Act 2020 Position

The NZ Privacy Act 2020 does not set hard data localisation requirements. However:

- **IPP 12** requires that when transferring personal information offshore, the recipient must provide comparable privacy protections
- For RSE (Recognised Seasonal Employer) scheme workers, the Ministry of Business, Innovation and Employment (MBIE) recommends that sensitive employment data be kept within jurisdictions with adequate privacy laws
- AWS US East operates under the **EU-US Data Privacy Framework** — this provides adequate protections, but Sydney is clearly preferable

**Risk level with current setup:** Low-Medium. Legally compliant, but not ideal for enterprise customers.

---

## Migration Plan to Sydney (ap-southeast-2)

### When to migrate

**Recommended:** Before your first paid enterprise customer or any orchard employing RSE workers under a formal contract.

**Not required:** For beta testing or pilots with a single trusted orchard.

### Step-by-step migration

#### 1. Create new Supabase project in Sydney

```
Supabase Dashboard → New Project
Organisation: [your org]
Name: harvestpro-nz-prod
Region: Southeast Asia (Sydney) — ap-southeast-2
Password: [generate strong password]
Plan: Free (or Pro)
```

#### 2. Export current data

```bash
# Get your direct connection string from Supabase Dashboard
# Project Settings → Database → Connection string (URI)
pg_dump postgresql://postgres:[PASSWORD]@db.mcbtyaebetzvzvnxydpy.supabase.co:5432/postgres \
  --format=custom \
  --compress=9 \
  --no-acl \
  --no-owner \
  --file=export_us_east1_$(date +%Y%m%d).dump
```

#### 3. Apply migrations on new project

```bash
# Set new project as active
supabase link --project-ref [NEW_PROJECT_REF]

# Apply all migrations
supabase db push

# Restore data
pg_restore \
  --host=db.[NEW_PROJECT_REF].supabase.co \
  --username=postgres \
  --dbname=postgres \
  --format=custom \
  --no-acl \
  --no-owner \
  export_us_east1_$(date +%Y%m%d).dump
```

#### 4. Update environment variables

```bash
# .env.local (development)
VITE_SUPABASE_URL=https://[NEW_PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY=[new_anon_key]

# GitHub Actions secrets
# Settings → Secrets → Update SUPABASE_URL and SUPABASE_ANON_KEY
```

#### 5. Update Edge Function secrets

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=[new_service_role_key]
supabase secrets set VAPID_PRIVATE_KEY=[existing_value]
# etc.
```

#### 6. Update Capacitor (Android)

The `androidScheme: 'https'` in `capacitor.config.ts` will work with any Supabase URL.

#### 7. Deploy and verify

```bash
npm run build
supabase functions deploy --all
# Test with a picker QR scan, payroll calculation, and compliance check
```

---

## Runtime Region Detection

The app includes a region check utility at `src/utils/regionCheck.ts` that warns if the Supabase project is not in the Asia-Pacific region.

---

## Future: Multi-region Strategy

For enterprise scale (100+ orchards):
- One Supabase project per region (NZ/AU = `ap-southeast-2`, Pacific Islands = varies)
- DNS-based routing to nearest region
- Read replicas for global dashboard users

This is beyond current scope but the RLS hardening migration (`20260321_rls_hardening.sql`) is designed to be compatible with this future architecture.
