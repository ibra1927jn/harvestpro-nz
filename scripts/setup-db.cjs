/**
 * Script de setup de DB para nuevo proyecto Supabase.
 * Aplica migraciones y crea usuarios de test via Admin API.
 *
 * SEGURIDAD: Este script conecta a la DB con credenciales service_role.
 * Todas las credenciales deben venir por env. Nunca commitear valores.
 *
 * Uso:
 *   export SUPABASE_PROJECT_REF=abc123
 *   export SUPABASE_DB_PASSWORD='...'
 *   export SUPABASE_SERVICE_ROLE_KEY='eyJ...'
 *   # Opcional: contra el proyecto real (p.ej. prod/staging) requiere confirmación explícita
 *   export ALLOW_PROD=1   # solo si sabes lo que haces
 *   node scripts/setup-db.cjs
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config desde env ───────────────────────────────────────────────────────
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOW_PROD = process.env.ALLOW_PROD === '1';

// Validación fail-fast: no avanzar sin las 3 variables
const missing = [];
if (!PROJECT_REF) missing.push('SUPABASE_PROJECT_REF');
if (!DB_PASSWORD) missing.push('SUPABASE_DB_PASSWORD');
if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length > 0) {
  console.error('❌ Faltan variables de entorno requeridas:');
  missing.forEach((v) => console.error(`   - ${v}`));
  console.error('\nVer cabecera del script para ejemplo de uso.');
  process.exit(1);
}

// Sanity-check formato service_role: debe ser un JWT empezando por "eyJ"
if (!/^eyJ[A-Za-z0-9_.-]{20,}$/.test(SERVICE_ROLE_KEY)) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY no parece un JWT válido');
  process.exit(1);
}

// Guard prod: si el ref no es claramente dev/test, exigir ALLOW_PROD=1
const DEV_REF_PATTERN = /^(dev|test|local|staging)-/i;
if (!DEV_REF_PATTERN.test(PROJECT_REF) && !ALLOW_PROD) {
  console.error(
    `❌ PROJECT_REF "${PROJECT_REF}" no parece dev/staging. ` +
      'Si de verdad quieres correr esto contra ese proyecto, define ALLOW_PROD=1.',
  );
  process.exit(1);
}

const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

// ── Datos demo (no-secretos) ───────────────────────────────────────────────
// Passwords demo son placeholders solo para entornos no-prod.
const TEST_USERS = [
  { email: 'manager@harvestpro.nz', password: '111111', role: 'manager' },
  { email: 'lead@harvestpro.nz', password: '111111', role: 'team_leader' },
  { email: 'runner@harvestpro.nz', password: '111111', role: 'runner' },
  { email: 'qc@harvestpro.nz', password: '111111', role: 'qc_inspector' },
  { email: 'payroll@harvestpro.nz', password: '111111', role: 'payroll_admin' },
  { email: 'admin@harvestpro.nz', password: '111111', role: 'admin' },
  { email: 'hr@harvestpro.nz', password: '111111', role: 'hr_admin' },
  { email: 'logistics@harvestpro.nz', password: '111111', role: 'logistics' },
];

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

async function connectDB() {
  const client = new Client({
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('✅ DB connected');
  return client;
}

async function runSQL(client, sql, label) {
  try {
    await client.query(sql);
    console.log(`✅ ${label}`);
  } catch (err) {
    console.error(`❌ ${label}: ${err.message.slice(0, 200)}`);
    throw err;
  }
}

async function applyMigrations(client) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`\n📦 Applying ${files.length} migrations...`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await runSQL(client, sql, `migration: ${file}`);
  }
}

function fetchJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createUsersViaAPI() {
  console.log('\n👤 Creating 8 test users via Admin API...');
  for (const user of TEST_USERS) {
    const url = new URL(`${SUPABASE_URL}/auth/v1/admin/users`);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    };
    const body = {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { role: user.role },
    };
    const res = await fetchJson(url, options, body);
    if (res.status === 200 || res.status === 201) {
      console.log(`✅ Created: ${user.email}`);
    } else if (res.body?.msg?.includes('already been registered') || res.status === 422) {
      console.log(`⚠️  Already exists: ${user.email}`);
    } else {
      console.error(`❌ Failed ${user.email}: ${JSON.stringify(res.body)}`);
    }
  }
}

async function updatePublicUsers(client) {
  console.log('\n🔗 Linking auth users to public.users...');
  const sql = `
    INSERT INTO public.users (id, email, full_name, role, orchard_id, is_active)
    SELECT
      au.id,
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)) as full_name,
      COALESCE(au.raw_user_meta_data->>'role', 'runner') as role,
      (SELECT id FROM public.orchards LIMIT 1) as orchard_id,
      true
    FROM auth.users au
    WHERE au.email LIKE '%@harvestpro.nz'
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      is_active = true;
  `;
  await runSQL(client, sql, 'public.users upsert');
}

async function main() {
  console.log('🚀 HarvestPro NZ — DB Setup Script');
  console.log(`   Target: ${SUPABASE_URL}\n`);

  let client;
  try {
    client = await connectDB();
    await applyMigrations(client);
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (client) await client.end();
    process.exit(1);
  }

  await createUsersViaAPI();

  try {
    await updatePublicUsers(client);
  } catch (err) {
    console.error(
      'public.users link failed (puede ser normal si orchards está vacío):',
      err.message,
    );
  }

  await client.end();
  console.log('\n✅ Setup completo! Ahora corre los E2E tests.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
