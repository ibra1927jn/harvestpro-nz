#!/usr/bin/env node
// Resume los resultados de scripts/loadsim/results en una tabla (markdown + JSON).
// Uso: node scripts/loadsim/summarize.mjs > scripts/loadsim/results/SUMMARY.md
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'results');
const SCEN = [
  ['A1-day1', '1 día', 0],
  ['B-2days', '2 días', 1],
  ['C-week', '1 semana', 6],
  ['D-month', '1 mes', 30],
  ['E-season', 'Temporada', 90],
];
const devices = { team_leader: 12, runner: 9, qc_inspector: 3, manager: 3, payroll_admin: 1, hr_admin: 1, logistics: 1, admin: 1 };
const read = f => (fs.existsSync(path.join(DIR, f)) ? JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) : null);
const mb = x => (x / 1048576).toFixed(1);

const rows = [];
for (const [key, label, days] of SCEN) {
  for (const v of ['current', 'optimized']) {
    const live = read(`${key}-${v}.json`);
    const per = read(`${key}-${v}.period.json`);
    if (!live && !per) continue;
    const r = { scenario: label, key, variant: v, historyDays: days };
    if (live) {
      r.live = {
        calls: live.total.calls,
        errors: live.total.errors,
        gzMB: +mb(live.total.gzIn),
        rawMB: +mb(live.total.bytesIn),
        upMB: +mb(live.total.bytesOut),
        realtimeMsgs: live.rtTotal.msgs,
        lagP50: live.realtimeLagMs.p50,
        lagP95: live.realtimeLagMs.p95,
        dbGrowthMB: +mb(live.db.growthBytes),
        scans: live.integrity.scansCreated,
        lost: live.integrity.scansLost,
        dupes: live.integrity.duplicateRowsInDb,
        truncated: live.integrity.truncatedQueries,
        openShifts: live.integrity.openShiftsAtEnd,
        perDeviceGzMB: Object.fromEntries(Object.entries(live.byRole).map(([k, x]) => [k, +(x.gzIn / 1048576 / (devices[k] || 1)).toFixed(2)])),
        errorsBy: live.endpoints.filter(e => e.errors).map(e => `${e.role} ${e.label}: ${e.errors}/${e.calls} ${JSON.stringify(e.status)}`),
        slowest: [...live.endpoints].sort((a, b) => b.p95 - a.p95).slice(0, 6).map(e => `${e.role} ${e.label} p95=${e.p95}ms (n=${e.calls})`),
        dbCpuAvg: live.docker?.db?.cpuAvg,
        edgeCpuAvg: live.docker?.edge_runtime?.cpuAvg,
        topSql: (live.topSql || []).slice(0, 5).map(q => `${q.total_ms}ms/${q.calls} ${q.query.slice(0, 90)}`),
      };
    }
    if (per) {
      r.period = { dbMB: per.dbMB, counts: per.counts, ops: per.results.map(o => ({ op: o.op, variant: o.variant, ok: o.ok, ms: o.ms, req: o.requests, err: o.errors, kbGz: o.kbInGzip, note: o.note })) };
    }
    rows.push(r);
  }
}

fs.writeFileSync(path.join(DIR, 'summary.json'), JSON.stringify(rows, null, 2));

const out = [];
out.push('# Loadsim — resumen\n');
out.push('| Escenario | Variante | Peticiones | Errores | Bajada gz MB | Subida MB | Realtime msgs | Lag p50/p95 ms | Crec. BD MB/día | Cubetas | Perdidas | Duplicadas | Truncadas |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (!r.live) continue;
  const l = r.live;
  out.push(`| ${r.scenario} | ${r.variant} | ${l.calls} | ${l.errors} | ${l.gzMB} | ${l.upMB} | ${l.realtimeMsgs} | ${l.lagP50}/${l.lagP95} | ${l.dbGrowthMB} | ${l.scans} | ${l.lost} | ${l.dupes} | ${l.truncated} |`);
}
out.push('\n## Operaciones de oficina con el volumen acumulado\n');
for (const r of rows) {
  if (!r.period) continue;
  out.push(`### ${r.scenario} — servidor ${r.variant} (BD ${r.period.dbMB} MB, ${r.period.counts.buckets} cubetas)\n`);
  out.push('| Operación | Consulta | OK | ms | peticiones | KB gz | nota |');
  out.push('|---|---|---|---|---|---|---|');
  for (const o of r.period.ops) out.push(`| ${o.op} | ${o.variant} | ${o.ok ? 'sí' : 'NO'} | ${o.ms} | ${o.req} | ${o.kbGz} | ${JSON.stringify(o.note ?? '').slice(0, 120).replace(/\|/g, '/')} |`);
  out.push('');
}
console.log(out.join('\n'));
