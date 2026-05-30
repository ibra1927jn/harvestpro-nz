/**
 * Crea usuarios demo via Supabase Admin API + REST API
 * No requiere conexión directa a PostgreSQL
 */
const https = require('https');

// SEGURIDAD: estas credenciales DEBEN venir por env. Fallo si faltan.
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!PROJECT_REF) missing.push('SUPABASE_PROJECT_REF');
if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length > 0) {
  console.error('❌ Faltan variables de entorno requeridas:');
  missing.forEach((v) => console.error(`   - ${v}`));
  process.exit(1);
}
if (!/^eyJ[A-Za-z0-9_.-]{20,}$/.test(SERVICE_ROLE_KEY)) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY no parece un JWT válido');
  process.exit(1);
}

const BASE_URL = `https://${PROJECT_REF}.supabase.co`;

const TEST_USERS = [
  { email: 'manager@harvestpro.nz',   password: '111111', role: 'manager',       full_name: 'Manager HarvestPro' },
  { email: 'lead@harvestpro.nz',      password: '111111', role: 'team_leader',   full_name: 'Team Leader' },
  { email: 'runner@harvestpro.nz',    password: '111111', role: 'runner',        full_name: 'Bucket Runner' },
  { email: 'qc@harvestpro.nz',        password: '111111', role: 'qc_inspector',  full_name: 'QC Inspector' },
  { email: 'payroll@harvestpro.nz',   password: '111111', role: 'payroll_admin', full_name: 'Payroll Admin' },
  { email: 'admin@harvestpro.nz',     password: '111111', role: 'admin',         full_name: 'System Admin' },
  { email: 'hr@harvestpro.nz',        password: '111111', role: 'hr_admin',      full_name: 'HR Admin' },
  { email: 'logistics@harvestpro.nz', password: '111111', role: 'logistics',     full_name: 'Logistics Manager' },
];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createAuthUser(user) {
  const res = await request('POST', '/auth/v1/admin/users', {
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { role: user.role, full_name: user.full_name },
  });
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✅ Auth user created: ${user.email} (id: ${res.body.id})`);
    return res.body.id;
  } else if (res.status === 422 || res.body?.msg?.includes('already')) {
    // Ya existe — obtener su ID
    const list = await request('GET', `/auth/v1/admin/users?email=${encodeURIComponent(user.email)}`);
    const existing = list.body?.users?.[0];
    if (existing) {
      console.log(`  ⚠️  Already exists: ${user.email} (id: ${existing.id})`);
      return existing.id;
    }
  } else {
    console.error(`  ❌ Failed ${user.email}: ${JSON.stringify(res.body)}`);
  }
  return null;
}

async function ensureOrchard() {
  // Verificar si ya existe un orchard
  const res = await request('GET', '/rest/v1/orchards?limit=1&select=id,name');
  if (res.status === 200 && Array.isArray(res.body) && res.body.length > 0) {
    console.log(`  ✅ Orchard exists: ${res.body[0].name} (${res.body[0].id})`);
    return res.body[0].id;
  }

  // Crear orchard base si no existe
  const create = await request('POST', '/rest/v1/orchards', {
    code: 'HP-TEST',
    name: 'HarvestPro Test Orchard',
    location: 'Hawke\'s Bay, NZ',
    total_rows: 50,
  });
  if (create.status === 201) {
    const id = Array.isArray(create.body) ? create.body[0]?.id : create.body?.id;
    console.log(`  ✅ Orchard created: ${id}`);
    return id;
  } else {
    console.error(`  ❌ Orchard creation failed: ${JSON.stringify(create.body)}`);
    return null;
  }
}

async function upsertPublicUser(userId, user, orchardId) {
  const res = await request('POST', '/rest/v1/users', {
    id: userId,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    orchard_id: orchardId,
    is_active: true,
  });
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✅ public.users: ${user.email} → ${user.role}`);
  } else {
    // Intentar PATCH si ya existe
    const patch = await request('PATCH', `/rest/v1/users?id=eq.${userId}`, {
      role: user.role,
      is_active: true,
      orchard_id: orchardId,
    });
    if (patch.status === 200 || patch.status === 204) {
      console.log(`  ✅ public.users updated: ${user.email}`);
    } else {
      console.error(`  ❌ public.users failed for ${user.email}: ${JSON.stringify(res.body)}`);
    }
  }
}

async function main() {
  console.log('🚀 HarvestPro NZ — Seed Users Script\n');

  // 1. Verificar conectividad
  console.log('1️⃣  Verificando conexión a Supabase...');
  const health = await request('GET', '/auth/v1/health');
  if (health.status !== 200) {
    console.error('❌ Cannot connect to Supabase:', health.status, health.body);
    process.exit(1);
  }
  console.log('  ✅ Connected to Supabase');

  // 2. Asegurar que existe un orchard
  console.log('\n2️⃣  Verificando orchard...');
  const orchardId = await ensureOrchard();

  // 3. Crear usuarios de auth
  console.log('\n3️⃣  Creando usuarios de auth...');
  const userIds = [];
  for (const user of TEST_USERS) {
    const id = await createAuthUser(user);
    userIds.push({ ...user, id });
  }

  // 4. Vincular en public.users (si hay orchard)
  if (orchardId) {
    console.log('\n4️⃣  Vinculando en public.users...');
    for (const user of userIds) {
      if (user.id) await upsertPublicUser(user.id, user, orchardId);
    }
  } else {
    console.log('\n⚠️  Sin orchard — public.users skipped (las migraciones pueden no estar aplicadas)');
  }

  console.log('\n✅ Seed completo!');
  console.log('   Login: manager@harvestpro.nz / 111111');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
