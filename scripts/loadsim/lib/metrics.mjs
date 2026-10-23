import zlib from 'node:zlib';

// Métricas del simulador: cada petición HTTP y cada mensaje realtime, por rol y por endpoint.
// Se mide en el cliente (lo que vería el móvil): latencia, bytes subidos/bajados, errores.

export class Metrics {
  constructor() {
    this.http = new Map(); // key `${role}|${label}` -> stats
    this.realtime = new Map(); // key `${role}|${channel}` -> {msgs, bytes}
    this.events = []; // incidencias puntuales (truncados, pérdidas, 429...)
    this.startedAt = Date.now();
  }

  static labelFor(url, method) {
    const u = new URL(url);
    const p = u.pathname;
    if (p.startsWith('/rest/v1/rpc/')) return `rpc ${p.slice('/rest/v1/rpc/'.length)}`;
    if (p.startsWith('/rest/v1/')) return `${method} ${p.slice('/rest/v1/'.length)}`;
    if (p.startsWith('/functions/v1/')) return `fn ${p.slice('/functions/v1/'.length)}`;
    if (p.startsWith('/auth/v1/')) return `auth ${p.slice('/auth/v1/'.length)}${u.searchParams.get('grant_type') ? ':' + u.searchParams.get('grant_type') : ''}`;
    if (p.startsWith('/storage/v1/')) return `storage ${method}`;
    return `${method} ${p}`;
  }

  recordHttp(role, label, { ms, bytesIn, bytesOut, status, error, gzIn = bytesIn }) {
    const key = `${role}|${label}`;
    let s = this.http.get(key);
    if (!s) {
      s = { role, label, calls: 0, errors: 0, status: {}, lat: [], bytesIn: 0, bytesOut: 0, gzIn: 0 };
      this.http.set(key, s);
    }
    s.calls++;
    s.bytesIn += bytesIn;
    s.bytesOut += bytesOut;
    s.gzIn += gzIn;
    s.lat.push(ms);
    const st = error ? 'neterr' : String(status);
    s.status[st] = (s.status[st] || 0) + 1;
    if (error || status >= 400) s.errors++;
  }

  recordRealtime(role, channel, bytes) {
    const key = `${role}|${channel}`;
    let s = this.realtime.get(key);
    if (!s) {
      s = { role, channel, msgs: 0, bytes: 0 };
      this.realtime.set(key, s);
    }
    s.msgs++;
    s.bytes += bytes;
  }

  event(kind, detail) {
    this.events.push({ t: Date.now() - this.startedAt, kind, ...detail });
  }

  static pct(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[i];
  }

  summary() {
    const endpoints = [];
    const byRole = {};
    let total = { calls: 0, errors: 0, bytesIn: 0, bytesOut: 0, gzIn: 0 };
    for (const s of this.http.values()) {
      const lat = [...s.lat].sort((a, b) => a - b);
      const row = {
        role: s.role,
        label: s.label,
        calls: s.calls,
        errors: s.errors,
        status: s.status,
        p50: Math.round(Metrics.pct(lat, 50)),
        p95: Math.round(Metrics.pct(lat, 95)),
        p99: Math.round(Metrics.pct(lat, 99)),
        max: Math.round(lat[lat.length - 1] || 0),
        bytesIn: s.bytesIn,
        bytesOut: s.bytesOut,
        gzIn: s.gzIn,
      };
      endpoints.push(row);
      const r = (byRole[s.role] ||= { calls: 0, errors: 0, bytesIn: 0, bytesOut: 0, gzIn: 0, rtMsgs: 0, rtBytes: 0 });
      r.gzIn += s.gzIn;
      r.calls += s.calls;
      r.errors += s.errors;
      r.bytesIn += s.bytesIn;
      r.bytesOut += s.bytesOut;
      total.calls += s.calls;
      total.errors += s.errors;
      total.bytesIn += s.bytesIn;
      total.bytesOut += s.bytesOut;
      total.gzIn += s.gzIn;
    }
    let rtTotal = { msgs: 0, bytes: 0 };
    const realtime = [];
    for (const s of this.realtime.values()) {
      realtime.push({ ...s });
      const r = (byRole[s.role] ||= { calls: 0, errors: 0, bytesIn: 0, bytesOut: 0, gzIn: 0, rtMsgs: 0, rtBytes: 0 });
      r.rtMsgs += s.msgs;
      r.rtBytes += s.bytes;
      rtTotal.msgs += s.msgs;
      rtTotal.bytes += s.bytes;
    }
    endpoints.sort((a, b) => b.bytesIn - a.bytesIn);
    const eventCounts = {};
    for (const e of this.events) eventCounts[e.kind] = (eventCounts[e.kind] || 0) + 1;
    return { total, rtTotal, byRole, endpoints, realtime, eventCounts, events: this.events.slice(0, 200) };
  }
}

// fetch instrumentado: un cliente supabase por dispositivo, con su rol.
// `net` permite simular cortes de red por dispositivo (offline => lanza TypeError como el navegador).
export function makeFetch(metrics, role, net) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const label = Metrics.labelFor(url, method);
    const bodyOut = init.body ? (typeof init.body === 'string' ? Buffer.byteLength(init.body) : init.body.byteLength || 0) : 0;
    // Cabeceras aproximadas (JWT ~ 900 bytes, apikey ~ 200, resto ~ 300) — lo que paga el móvil en cada petición
    const headerOut = 1400 + url.length;
    const t0 = performance.now();
    if (net && net.offline) {
      metrics.recordHttp(role, label, { ms: 0, bytesIn: 0, bytesOut: 0, status: 0, error: true });
      throw new TypeError('Failed to fetch (simulated offline)');
    }
    try {
      const res = await fetch(input, init);
      const buf = Buffer.from(await res.arrayBuffer());
      const ms = performance.now() - t0;
      // ~ 350 bytes de cabeceras de respuesta
      // Lo que baja por la red de verdad: Supabase sirve JSON comprimido (gzip) a partir de ~1 KB
      const gz = buf.length > 1024 ? zlib.gzipSync(buf, { level: 6 }).length : buf.length;
      metrics.recordHttp(role, label, { ms, bytesIn: buf.length + 350, gzIn: gz + 350, bytesOut: bodyOut + headerOut, status: res.status });
      if (res.status === 429) metrics.event('rate_limited', { role, label });
      if (res.status >= 500) metrics.event('server_error', { role, label, status: res.status, body: buf.toString('utf8').slice(0, 300) });
      const headers = new Headers(res.headers);
      headers.delete('content-encoding');
      headers.delete('content-length');
      return new Response(res.status === 204 || res.status === 304 ? null : buf, { status: res.status, statusText: res.statusText, headers });
    } catch (err) {
      const ms = performance.now() - t0;
      metrics.recordHttp(role, label, { ms, bytesIn: 0, bytesOut: bodyOut + headerOut, status: 0, error: true });
      metrics.event('network_error', { role, label, message: String(err && err.message).slice(0, 200) });
      throw err;
    }
  };
}
