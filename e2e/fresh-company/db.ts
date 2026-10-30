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

/** Claves ajenas de una columna (hijo → padre) de public y auth */
const FK_SQL = `
    SELECT con.conrelid::regclass::text AS child, a.attname AS col, con.confrelid::regclass::text AS parent,
           pa.attname AS pcol,
           EXISTS (SELECT 1 FROM pg_attribute x WHERE x.attrelid = con.conrelid AND x.attname = 'id' AND NOT x.attisdropped) AS child_has_id
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
    JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = con.conrelid)
    WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1 AND n.nspname IN ('public', 'auth')`;

/**
 * Filas «huérfanas» por clave ajena (el hijo apunta a un padre que no existe).
 * Sirve para comprobar que la limpieza no deja restos: el total no puede subir.
 */
export function orphanCount(): number {
    const [n] = sql(`
DO $$
DECLARE r record; v bigint; v_total bigint := 0;
BEGIN
    FOR r IN ${FK_SQL} LOOP
        EXECUTE format('SELECT count(*) FROM %s c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
                       r.child, r.col, r.parent, r.pcol, r.col) INTO v;
        v_total := v_total + v;
    END LOOP;
    PERFORM set_config('e2e.orphans', v_total::text, false);
END $$;
SELECT current_setting('e2e.orphans');`);
    return Number(n);
}

/**
 * Borra el huerto de la prueba, las cuentas creadas y TODO lo que cuelga de
 * ellos (siguiendo las claves ajenas hasta el final: cubetas, fichajes,
 * pickers, filas, chat, auditoría…). Solo esos ids; los datos demo no se tocan.
 * Se borra sin disparadores (session_replication_role), así que primero se
 * recoge el árbol completo de filas a borrar.
 */
export function cleanupShared(orchardId: string, emails: readonly string[]): void {
    const emailList = emails.map(e => lit(e.toLowerCase())).join(', ');
    sql(`
DO $$
DECLARE
    r record;
    v_added bigint;
    v_prev bigint := -1;
    v_round int := 0;
BEGIN
    CREATE TEMP TABLE e2e_del (tbl text, id text, PRIMARY KEY (tbl, id)) ON COMMIT DROP;
    INSERT INTO e2e_del VALUES ('orchards', ${lit(orchardId)});
    INSERT INTO e2e_del SELECT 'users', id::text FROM public.users WHERE lower(email) IN (${emailList}) ON CONFLICT DO NOTHING;
    INSERT INTO e2e_del SELECT 'auth.users', id::text FROM auth.users WHERE lower(email) IN (${emailList}) ON CONFLICT DO NOTHING;
    INSERT INTO e2e_del SELECT 'allowed_registrations', id::text FROM public.allowed_registrations WHERE lower(email) IN (${emailList}) ON CONFLICT DO NOTHING;
    -- Hijos de lo recogido, hasta que no salga nada nuevo
    LOOP
        v_added := 0;
        v_round := v_round + 1;
        FOR r IN ${FK_SQL} LOOP
            IF r.child_has_id THEN
                EXECUTE format('INSERT INTO e2e_del SELECT %L, c.id::text FROM %s c WHERE c.%I::text IN (SELECT id FROM e2e_del WHERE tbl = %L) ON CONFLICT DO NOTHING',
                               r.child, r.child, r.col, r.parent);
            END IF;
        END LOOP;
        SELECT count(*) INTO v_added FROM e2e_del;
        EXIT WHEN v_added = v_prev OR v_round > 20;
        v_prev := v_added;
    END LOOP;

    SET LOCAL session_replication_role = replica;
    -- Hojas sin columna id (p. ej. claves compuestas): por su clave ajena
    FOR r IN ${FK_SQL} LOOP
        IF NOT r.child_has_id THEN
            EXECUTE format('DELETE FROM %s c WHERE c.%I::text IN (SELECT id FROM e2e_del WHERE tbl = %L)', r.child, r.col, r.parent);
        END IF;
    END LOOP;
    FOR r IN SELECT DISTINCT tbl FROM e2e_del LOOP
        EXECUTE format('DELETE FROM %s t WHERE t.id::text IN (SELECT id FROM e2e_del WHERE tbl = %L)', r.tbl, r.tbl);
    END LOOP;
END $$;`);
}
