/**
 * Base de datos para «empresa desde cero» (psql + Auth admin de Supabase).
 *
 * Dos modos:
 *  - fresh:  la base no tiene ningún huerto (CI con Supabase recién levantado).
 *            El primer admin se registra por la pantalla de alta (/signup →
 *            provision-orchard), como un cliente nuevo de verdad.
 *  - shared: la base ya tiene huertos (el Supabase local con los datos demo).
 *            El alta pública está cerrada («ya está configurada»), así que el
 *            test crea lo mismo que provision-orchard (huerto + ajustes + admin)
 *            con la clave de servicio y al final BORRA solo lo que creó.
 *            Los datos demo no se tocan.
 */
import { execFileSync } from 'child_process';

const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Ejecuta SQL y devuelve las filas (columnas separadas por '|'). */
export function sql(query: string): string[] {
    const out = execFileSync('psql', [DB_URL, '-At', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf-8' });
    return out.split('\n').map(l => l.trim()).filter(Boolean);
}

export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export type FreshMode = 'fresh' | 'shared';

export function detectMode(): FreshMode {
    const [n] = sql('select count(*) from public.orchards where deleted_at is null');
    return Number(n) === 0 ? 'fresh' : 'shared';
}

/** El servidor exige 2FA a admin/manager: este test corre con la configuración de desarrollo */
export function serverEnforcesMfa(): boolean {
    const [v] = sql('select coalesce((select enforce_mfa from public.security_settings where id), true)');
    return v === 't';
}

function serviceEnv(): { url: string; key: string } {
    const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is needed for the shared-database mode');
    return { url, key };
}

/** Lo mismo que provision-orchard, para una base que ya tiene huertos */
export async function provisionLikeSignup(input: { orchardName: string; adminName: string; email: string; password: string }): Promise<{ orchardId: string; userId: string }> {
    const { url, key } = serviceEnv();
    const res = await fetch(`${url}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: input.email,
            password: input.password,
            email_confirm: true,
            user_metadata: { name: input.adminName, role: 'admin', onboarding_source: 'e2e-fresh-company' },
        }),
    });
    if (!res.ok) throw new Error(`auth admin createUser failed: ${res.status} ${await res.text()}`);
    const user = (await res.json()) as { id: string };
    const [orchardId] = sql(`insert into public.orchards (name, total_rows) values (${lit(input.orchardName)}, 20) returning id`);
    sql(`insert into public.users (id, email, full_name, role, orchard_id, is_active, privacy_consent_at)
         values (${lit(user.id)}, ${lit(input.email)}, ${lit(input.adminName)}, 'admin', ${lit(orchardId)}, true, now())`);
    sql(`insert into public.harvest_settings (orchard_id, piece_rate, min_wage_rate) values (${lit(orchardId)}, 6.5, 23.95)`);
    return { orchardId, userId: user.id };
}

export function orchardIdByName(name: string): string | null {
    const [id] = sql(`select id from public.orchards where name = ${lit(name)} order by created_at desc limit 1`);
    return id ?? null;
}

/**
 * Borra el huerto de la prueba y las cuentas creadas (solo esos ids). Sin
 * disparadores ni claves ajenas durante el borrado (session_replication_role),
 * así que se borra explícitamente cada tabla que apunta a ellos.
 */
export function cleanupShared(orchardId: string, emails: readonly string[]): void {
    const emailList = emails.map(lit).join(', ');
    sql(`
DO $$
DECLARE
    v_orchard uuid := ${lit(orchardId)};
    v_users uuid[] := ARRAY(SELECT id FROM auth.users WHERE lower(email) IN (${emailList.toLowerCase()}));
    r record;
BEGIN
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.block_rows WHERE block_id IN (SELECT id FROM public.orchard_blocks WHERE orchard_id = v_orchard);
    -- Tablas con orchard_id
    FOR r IN SELECT c.table_name FROM information_schema.columns c
             JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
             WHERE c.table_schema = 'public' AND c.column_name = 'orchard_id' AND c.table_name <> 'orchards' LOOP
        EXECUTE format('DELETE FROM public.%I WHERE orchard_id = $1', r.table_name) USING v_orchard;
    END LOOP;
    -- Columnas que apuntan a las cuentas de la prueba (public.users / auth.users)
    FOR r IN SELECT con.conrelid::regclass AS tbl, a.attname AS col
             FROM pg_constraint con
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
             WHERE con.contype = 'f' AND con.confrelid IN ('public.users'::regclass, 'auth.users'::regclass)
               AND array_length(con.conkey, 1) = 1 LOOP
        EXECUTE format('DELETE FROM %s WHERE %I = ANY ($1)', r.tbl, r.col) USING v_users;
    END LOOP;
    DELETE FROM public.allowed_registrations WHERE lower(email) IN (${emailList.toLowerCase()});
    DELETE FROM public.users WHERE id = ANY (v_users);
    DELETE FROM auth.identities WHERE user_id = ANY (v_users);
    DELETE FROM auth.users WHERE id = ANY (v_users);
    DELETE FROM public.orchards WHERE id = v_orchard;
END $$;`);
}
