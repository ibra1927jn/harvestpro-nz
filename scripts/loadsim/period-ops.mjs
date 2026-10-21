#!/usr/bin/env node
// =============================================================================
// LOADSIM — operaciones de oficina con el volumen acumulado
//
// Tras N días de temporada (history.sh), mide las operaciones que más pesan al
// final de una semana, de un mes o de la temporada: nómina de la semana, cierre
// de semanas, informe semanal, RRHH, arranque de un móvil, chat, auditoría…
// Cada operación se mide como la hace la app hoy ("current") y, cuando hay
// versión mejorada, también la mejorada ("optimized").
//
// Uso: node scripts/loadsim/period-ops.mjs --label season --out results/period-season.json [--close-weeks]
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Metrics, makeFetch } from './lib/metrics.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const LABEL = args.label || 'period';
const OUT = args.out || `scripts/loadsim/results/period-${LABEL}.json`;
const API_URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const accounts = fs
  .readFileSync(path.join(DIR, 'accounts.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map(l => {
    const [label, role, orchard, id, email, orchard_id] = l.split(',');
    return { label, role, orchard: +orchard, id, email, orchard_id };
  });

const sql = q =>
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-q', '-F', '\t', '-f', '-'], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
    input: q,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();

const NZ_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const dayStr = n => new Date(Date.parse(`${NZ_DATE}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
function nzMidnightISO(dateStr) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const nzHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', hour12: false }).format(probe));
  const offset = (nzHour - 12 + 24) % 24;
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - offset * 3600 * 1000).toISOString();
}
const mondayOf = d => {
  const x = new Date(`${d}T12:00:00Z`);
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
};
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function fetchAll(page) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) throw r.error;
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}

const results = [];
async function measure(name, variant, metrics, fn) {
  const before = metrics.summary().total;
  const t0 = performance.now();
  let note = null;
  let ok = true;
  try {
    note = await fn();
  } catch (e) {
    ok = false;
    note = String(e && e.message).slice(0, 200);
  }
  const ms = Math.round(performance.now() - t0);
  const after = metrics.summary().total;
  const row = {
    op: name,
    variant,
    ok,
    ms,
    requests: after.calls - before.calls,
    errors: after.errors - before.errors,
    kbIn: Math.round((after.bytesIn - before.bytesIn) / 1024),
    kbInGzip: Math.round((after.gzIn - before.gzIn) / 1024),
    note,
  };
  results.push(row);
  console.log(`${name.padEnd(42)} ${variant.padEnd(9)} ${String(ms).padStart(7)}ms req=${String(row.requests).padStart(4)} err=${row.errors} in=${row.kbIn}KB (gz ${row.kbInGzip}KB) ${note ? JSON.stringify(note).slice(0, 90) : ''}`);
  return row;
}

async function client(label) {
  const acc = accounts.find(a => a.label === label);
  const metrics = new Metrics();
  const sb = createClient(API_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: makeFetch(metrics, acc.role) } });
  const { error } = await sb.auth.signInWithPassword({ email: acc.email, password: 'loadsim-111111' });
  if (error) throw error;
  return { sb, acc, metrics };
}

async function main() {
  const counts = sql(`select (select count(*) from bucket_records), (select count(*) from daily_attendance), (select count(*) from audit_logs), (select count(*) from chat_messages), (select count(distinct date) from daily_attendance)`).split('\t').map(Number);
  console.log(`period-ops [${LABEL}] buckets=${counts[0]} attendance=${counts[1]} audit=${counts[2]} chat=${counts[3]} days=${counts[4]}`);
  const payroll = await client('payroll');
  const hr = await client('hr');
  const mgr = await client('manager-1');
  const runner = await client('runner-1-1');
  const admin = await client('admin');
  const o = mgr.acc.orchard_id;
  const thisMonday = mondayOf(NZ_DATE);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);

  // 1. Nómina de la semana pasada (empresa) — ¿salen los nombres?
  for (const [variant] of [['current']]) {
    await measure('calculate-payroll (last week, company)', variant, payroll.metrics, async () => {
      const { data, error } = await payroll.sb.functions.invoke('calculate-payroll', { body: { start_date: lastMonday, end_date: lastSunday } });
      if (error) throw error;
      const rows = data?.picker_breakdown || [];
      const noName = rows.filter(r => !r.picker_name || r.picker_name === 'Unknown').length;
      return { people: rows.length, withoutName: noName, total: data?.summary?.total_earnings };
    });
  }
  await measure('calculate-payroll (this week, company)', 'current', payroll.metrics, async () => {
    const { data, error } = await payroll.sb.functions.invoke('calculate-payroll', { body: { start_date: thisMonday, end_date: addDays(thisMonday, 6) } });
    if (error) throw error;
    return { people: (data?.picker_breakdown || []).length };
  });

  // 2. Informe semanal del manager (useWeeklyReport): cubetas + fichajes de la semana
  await measure('weekly report (manager, 7 days)', 'current', mgr.metrics, async () => {
    const b = await fetchAll((f, t) => mgr.sb.from('bucket_records').select('picker_id, orchard_id, variety, scanned_at, quality_grade').eq('orchard_id', o).is('deleted_at', null).gte('scanned_at', nzMidnightISO(lastMonday)).lte('scanned_at', nzMidnightISO(thisMonday)).order('id').range(f, t));
    const a = await fetchAll((f, t) => mgr.sb.from('daily_attendance').select('picker_id, orchard_id, date, check_in, check_out, break_start, break_minutes').eq('orchard_id', o).is('deleted_at', null).gte('date', lastMonday).lte('date', lastSunday).order('id').range(f, t));
    return { buckets: b.length, attendance: a.length };
  });

  // 3. Hoja del día (TimesheetEditor / Nómina): personas del día en cualquier huerto
  for (const variant of ['current', 'optimized']) {
    await measure('day sheet: buckets of the day (orchard)', variant, mgr.metrics, async () => {
      const d = dayStr(1) === NZ_DATE ? dayStr(2) : dayStr(1);
      const att = await mgr.sb.from('daily_attendance').select('picker_id').eq('orchard_id', o).eq('date', d);
      const ids = [...new Set((att.data || []).map(x => x.picker_id))];
      if (variant === 'current') {
        const r = await mgr.sb.from('bucket_records').select('picker_id, orchard_id, variety, scanned_at, quality_grade').in('picker_id', ids).is('deleted_at', null).gte('scanned_at', nzMidnightISO(d)).lte('scanned_at', nzMidnightISO(addDays(d, 1)));
        const real = Number(sql(`select count(*) from bucket_records where picker_id in (select picker_id from daily_attendance where orchard_id='${o}' and date='${d}') and scanned_at >= '${nzMidnightISO(d)}' and scanned_at <= '${nzMidnightISO(addDays(d, 1))}' and deleted_at is null`));
        return { people: ids.length, got: r.data?.length ?? 0, real, status: r.status };
      }
      const rows = [];
      for (let i = 0; i < ids.length; i += 100) {
        rows.push(...(await fetchAll((f, t) => mgr.sb.from('bucket_records').select('picker_id, orchard_id, variety, scanned_at, quality_grade').in('picker_id', ids.slice(i, i + 100)).is('deleted_at', null).gte('scanned_at', nzMidnightISO(d)).lte('scanned_at', nzMidnightISO(addDays(d, 1))).order('id').range(f, t))));
      }
      return { people: ids.length, got: rows.length };
    });
  }

  // 4. RRHH al abrir la pantalla
  await measure('HR employees: contracts IN (all staff)', 'current', hr.metrics, async () => {
    const p = await hr.sb.from('pickers').select('id').is('deleted_at', null);
    const u = await hr.sb.from('users').select('id');
    const ids = [...(p.data || []), ...(u.data || [])].map(x => x.id);
    const r = await hr.sb.from('contracts').select('id, employee_id, type, status, start_date, end_date, hourly_rate, updated_at').in('employee_id', ids).in('status', ['active', 'expiring']).is('deleted_at', null);
    return { ids: ids.length, status: r.status, got: r.data?.length ?? null };
  });
  await measure('HR employees: contracts by chunks', 'optimized', hr.metrics, async () => {
    const p = await hr.sb.from('pickers').select('id').is('deleted_at', null);
    const u = await hr.sb.from('users').select('id');
    const ids = [...(p.data || []), ...(u.data || [])].map(x => x.id);
    let got = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const r = await hr.sb.from('contracts').select('id, employee_id, type, status, start_date, end_date, hourly_rate, updated_at').in('employee_id', ids.slice(i, i + 100)).in('status', ['active', 'expiring']).is('deleted_at', null);
      got += r.data?.length ?? 0;
    }
    return { ids: ids.length, got };
  });

  // 5. Arranque en frío de un móvil (runner) a esta altura de la temporada
  await measure('cold start runner: today buckets + crew', 'current', runner.metrics, async () => {
    const pr = await runner.sb.from('pickers').select('*, daily_attendance!left(id, check_in, check_out, break_start, break_minutes, orchard_id, deleted_at)').eq('daily_attendance.date', NZ_DATE).eq('daily_attendance.orchard_id', runner.acc.orchard_id).eq('status', 'active').is('deleted_at', null);
    const b = await fetchAll((f, t) => runner.sb.from('bucket_records').select('*').eq('orchard_id', runner.acc.orchard_id).gte('scanned_at', nzMidnightISO(NZ_DATE)).is('deleted_at', null).order('id').range(f, t));
    return { crew: pr.data?.length, buckets: b.length };
  });

  // 6. Chat: lista de conversaciones (último mensaje) y abrir el grupo del huerto
  await measure('chat list: last messages (all rows)', 'current', mgr.metrics, async () => {
    const c = await mgr.sb.from('conversations').select('id').contains('participant_ids', [mgr.acc.id]);
    const ids = (c.data || []).map(x => x.id);
    const r = await mgr.sb.from('chat_messages').select('conversation_id, content, created_at').in('conversation_id', ids).order('created_at', { ascending: false });
    return { conversations: ids.length, rows: r.data?.length, truncated: r.data?.length === 1000 };
  });
  await measure('chat list: last_messages RPC', 'optimized', mgr.metrics, async () => {
    const c = await mgr.sb.from('conversations').select('id').contains('participant_ids', [mgr.acc.id]);
    const ids = (c.data || []).map(x => x.id);
    const r = await mgr.sb.rpc('last_messages', { p_conversation_ids: ids });
    if (r.error) throw r.error;
    return { rows: r.data?.length };
  });
  const conv = sql(`select id from conversations where name='Sim Orchard 1 crew'`);
  await measure('open orchard chat (asc, no limit)', 'current', mgr.metrics, async () => {
    const r = await mgr.sb.from('chat_messages').select('*').eq('conversation_id', conv).order('created_at', { ascending: true });
    const total = Number(sql(`select count(*) from chat_messages where conversation_id='${conv}'`));
    const newest = sql(`select max(created_at) from chat_messages where conversation_id='${conv}'`);
    const gotNewest = r.data?.length ? r.data[r.data.length - 1].created_at : null;
    return { total, got: r.data?.length, newestShown: gotNewest ? Date.parse(gotNewest) === Date.parse(newest) : null };
  });
  await measure('open orchard chat (latest 300)', 'optimized', mgr.metrics, async () => {
    const r = await mgr.sb.from('chat_messages').select('*').eq('conversation_id', conv).order('created_at', { ascending: false }).limit(300);
    return { got: r.data?.length };
  });

  // 7. Manager: WageShield 7 días (cubetas + fichajes paginados)
  await measure('manager dashboard: 7-day bleed', 'current', mgr.metrics, async () => {
    const a = await fetchAll((f, t) => mgr.sb.from('daily_attendance').select('picker_id, date, check_in, check_out, break_minutes').eq('orchard_id', o).gte('date', dayStr(6)).order('id').range(f, t));
    const b = await fetchAll((f, t) => mgr.sb.from('bucket_records').select('picker_id, scanned_at').eq('orchard_id', o).gte('scanned_at', nzMidnightISO(dayStr(6))).is('deleted_at', null).order('id').range(f, t));
    return { attendance: a.length, buckets: b.length };
  });

  // 8. Nómina: turnos sin cerrar de toda la empresa (30 días)
  await measure('payroll: unclosed shifts 30d (company)', 'current', payroll.metrics, async () => {
    const r = await payroll.sb.from('daily_attendance').select('id, picker_id, orchard_id, date, check_in, pickers(name), orchards(name)').is('check_out', null).is('deleted_at', null).not('check_in', 'is', null).lt('date', NZ_DATE).gte('date', dayStr(30));
    return { rows: r.data?.length };
  });

  // 9. Admin: registro de auditoría
  await measure('admin: audit log (100)', 'current', admin.metrics, async () => {
    const r = await admin.sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    return { rows: r.data?.length };
  });

  // 10. Cierre de semanas de pago pendientes (close-pay-week)
  if (args['close-weeks']) {
    const firstDay = sql(`select min(date) from daily_attendance where orchard_id in (select id from orchards where code like 'SIM%')`);
    let wk = mondayOf(firstDay);
    let closed = 0;
    while (wk < thisMonday) {
      const st = sql(`select status from pay_weeks where week_start='${wk}'`);
      if (st !== 'closed') {
        await measure(`close-pay-week ${wk}`, 'current', payroll.metrics, async () => {
          const { data, error } = await payroll.sb.functions.invoke('close-pay-week', { body: { action: 'close', week_start: wk, reason: 'loadsim' } });
          if (error) {
            const body = error.context ? await error.context.text?.() : '';
            throw new Error(`${error.message} ${String(body).slice(0, 160)}`);
          }
          closed++;
          return { status: data?.status ?? data?.week?.status ?? 'ok' };
        });
      }
      wk = addDays(wk, 7);
    }
  }

  const sizes = sql(`select table_name, approx_rows, total_bytes, index_bytes from loadsim.table_sizes limit 12`)
    .split('\n')
    .map(l => {
      const [t, r, b, ib] = l.split('\t');
      return { table: t, rows: +r, MB: Math.round(+b / 1048576 * 10) / 10, indexMB: Math.round(+ib / 1048576 * 10) / 10 };
    });
  const dbMB = Math.round(Number(sql(`select pg_database_size('postgres')`)) / 1048576);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ label: LABEL, date: NZ_DATE, counts: { buckets: counts[0], attendance: counts[1], audit: counts[2], chat: counts[3], days: counts[4] }, dbMB, sizes, results }, null, 2));
  console.log(`db=${dbMB}MB -> ${OUT}`);
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
