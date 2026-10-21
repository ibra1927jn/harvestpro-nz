#!/usr/bin/env node
// =============================================================================
// LOADSIM — un día de cosecha en vivo contra el Supabase local
//
// Cada dispositivo (manager, team leaders, runners, QC, oficina) es un cliente
// supabase-js con su propia sesión y hace las mismas llamadas que la app
// (mismas tablas, mismos select, mismos Edge Functions, mismo realtime), con el
// horario de un día de cosecha. El tiempo va acelerado (SIM_SPEED): los totales
// por día (peticiones, bytes, mensajes) son los de un día real; la carga por
// segundo en el servidor es SIM_SPEED veces la real (prueba de estrés).
//
// Uso:
//   node scripts/loadsim/live-day.mjs --speed 40 --out results/day1.json [--chaos] [--variant optimized]
//
// Mira scripts/loadsim/README.md para el escenario completo.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Metrics, makeFetch } from './lib/metrics.mjs';

// ---------- configuración ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const SPEED = Number(args.speed || process.env.SIM_SPEED || 40);
const OUT = args.out || `scripts/loadsim/results/day-${Date.now()}.json`;
const CHAOS = !!args.chaos; // cortes de red, reintentos duplicados, móviles sin cobertura
const VARIANT = args.variant || 'current'; // 'current' = la app tal cual; 'optimized' = con las mejoras propuestas
const DAY_END = parseHHMM(args.until || '17:30');
const DAY_BEGIN = parseHHMM(args.from || '05:45');
const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const PASSWORD = 'loadsim-111111';
const ACCOUNTS_CSV = path.join(path.dirname(new URL(import.meta.url).pathname), 'accounts.csv');
const OPT = VARIANT === 'optimized';

function parseHHMM(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}

// ---------- reloj virtual ----------
// Minutos del día (hora NZ) virtuales; la simulación arranca en DAY_BEGIN.
let realStart = Date.now();
const clock = {
  minute() {
    return DAY_BEGIN + ((Date.now() - realStart) * SPEED) / 60000;
  },
  hhmm() {
    const m = this.minute();
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  },
  sleepV(virtualMs) {
    return new Promise(r => setTimeout(r, Math.max(1, virtualMs / SPEED)));
  },
  async until(minuteOfDay) {
    const now = this.minute();
    if (minuteOfDay > now) await this.sleepV((minuteOfDay - now) * 60000);
  },
  over() {
    return this.minute() >= DAY_END;
  },
};
const SEC = 1000;
const MIN = 60 * SEC;

// Fecha NZ de hoy y medianoche NZ en UTC
const NZ_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
function nzMidnightISO(dateStr = NZ_DATE) {
  // offset NZ de hoy (NZDT +13 / NZST +12)
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const nzHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', hour12: false }).format(probe));
  const offset = (nzHour - 12 + 24) % 24;
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) - offset * 3600 * 1000).toISOString();
}
const NZ_MIDNIGHT = nzMidnightISO();
function daysAgo(n) {
  const d = new Date(Date.parse(`${NZ_DATE}T12:00:00Z`) - n * 86400000);
  return d.toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const expo = meanMs => -Math.log(1 - Math.random()) * meanMs;

// ---------- cuentas ----------
const accounts = fs
  .readFileSync(ACCOUNTS_CSV, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map(l => {
    const [label, role, orchard, id, email, orchard_id] = l.split(',');
    return { label, role, orchard: Number(orchard), id, email, orchard_id };
  });

const metrics = new Metrics();
const state = {
  scansCreated: 0,
  scansAcked: 0,
  scansRejected: 0,
  scanIds: new Set(),
  duplicateSends: 0,
  realtimeLag: [],
  truncatedQueries: 0,
  pickersByOrchard: new Map(), // orchard_id -> [{id, tl}]
  attendanceByPicker: new Map(), // picker_id -> attendance_id
  presentByOrchard: new Map(),
  transportPending: new Map(), // id -> {orchard_id, updated_at, created}
};

// ---------- dispositivo ----------
class Device {
  constructor(acc) {
    Object.assign(this, acc);
    this.net = { offline: false };
    this.sb = createClient(API_URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: makeFetch(metrics, acc.role, this.net) },
      realtime: { params: { eventsPerSecond: 50 } },
    });
    this.bucketQueue = []; // Dexie bucket_queue: {scan, synced}
    this.auditQueue = [];
    this.uploadBackoff = 5 * SEC;
    this.visible = true;
    this.channels = [];
    this.lastSyncAt = null;
    this.bucketCount = 0;
    this.crewCount = 0;
    this.lastVisibilityRefresh = 0;
    this.chatOpenUntil = 0;
    this.lastActive = clock.minute();
  }

  log(...a) {
    if (process.env.SIM_VERBOSE) console.log(`[${clock.hhmm()}] ${this.label}`, ...a);
  }

  async login() {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: this.email, password: PASSWORD });
    if (error) throw new Error(`login ${this.email}: ${error.message}`);
    this.session = data.session;
    await this.sb.realtime.setAuth(data.session.access_token);
  }

  // ----- arranque común de la app (todos los roles) -----
  async bootstrap() {
    const sb = this.sb;
    await Promise.all([
      sb.from('users').select('*').eq('id', this.id).maybeSingle(),
      sb.from('orchards').select('id, name, total_rows').order('name'),
    ]);
    // warmup de Edge Functions por rol
    const warm = {
      admin: ['manage-attendance', 'record-bucket', 'calculate-payroll', 'check-compliance'],
      manager: ['manage-attendance', 'record-bucket', 'calculate-payroll', 'check-compliance'],
      team_leader: ['manage-attendance', 'record-bucket', 'check-compliance'],
      runner: ['record-bucket'],
      payroll_admin: ['calculate-payroll'],
      hr_admin: ['calculate-payroll'],
    }[this.role] || [];
    await Promise.all(warm.map(fn => sb.functions.invoke(fn, { body: { _warmup: true } }).catch(() => {})));
    await this.refreshMessages();
    await this.fetchOrchardData();
    this.subscribeRealtime();
  }

  async refreshMessages() {
    const sb = this.sb;
    const [b, c] = await Promise.all([
      sb.from('broadcasts').select('*').eq('orchard_id', this.orchard_id).order('created_at', { ascending: false }).limit(20),
      sb.from('conversations').select('*').contains('participant_ids', [this.id]).order('updated_at', { ascending: false }),
      sb.rpc('my_unread_counts'),
    ]);
    const convs = c.data || [];
    const ids = [...new Set(convs.flatMap(x => x.participant_ids || []))].slice(0, 60);
    const convIds = convs.map(x => x.id);
    await Promise.all([
      ids.length ? sb.from('pickers').select('id, name').in('id', ids) : null,
      ids.length ? sb.from('users').select('id, full_name').in('id', ids) : null,
      convIds.length
        ? OPT
          ? sb.rpc('last_messages', { p_conversation_ids: convIds }) // 1 fila por conversación
          : sb.from('chat_messages').select('conversation_id, content, created_at').in('conversation_id', convIds).order('created_at', { ascending: false })
        : null,
    ]).then(r => {
      const last = r[2];
      if (!OPT && last?.data?.length === 1000) {
        state.truncatedQueries++;
        metrics.event('truncated', { role: this.role, what: 'chat_messages last messages (1000 rows)' });
      }
    });
    return b;
  }

  // ----- fetchOrchardData (storeSync.ts) -----
  async fetchOrchardData({ catchUp = false } = {}) {
    const sb = this.sb;
    const o = this.orchard_id;
    const useDelta = !!this.lastSyncAt && this.crewCount > 0 && this.bucketCount > 0;
    // app optimizada: al desbloquear (catchUp) no vuelve a pedir huerto, ajustes ni bloques
    const light = OPT && catchUp && useDelta;
    if (!light) {
      await sb.from('orchards').select('*').eq('id', o).single();
      await sb.from('harvest_settings').select('*').eq('orchard_id', o).maybeSingle();
      await sb.from('variety_rates').select('id, orchard_id, variety, piece_rate').or(`orchard_id.eq.${o},orchard_id.is.null`);
    }

    const nowIso = new Date().toISOString();
    const pickersSel = '*, daily_attendance!left(id, check_in, check_out, break_start, break_minutes, orchard_id, deleted_at)';
    let pq = sb.from('pickers').select(pickersSel).eq('daily_attendance.date', NZ_DATE).eq('daily_attendance.orchard_id', o);
    const bucketSel = '*';
    let bucketsPromise;
    if (useDelta) {
      const since = new Date(Date.parse(this.lastSyncAt) - 120000).toISOString();
      pq = pq.gte('updated_at', since);
      if (OPT) {
        // delta paginado: no se pierde nada si el móvil estuvo dormido más de 1000 cubetas
        bucketsPromise = fetchAll((f, t) =>
          sb.from('bucket_records').select(bucketSel).eq('orchard_id', o).gte('scanned_at', NZ_MIDNIGHT).order('scanned_at', { ascending: false }).gte('updated_at', since).order('id').range(f, t),
        );
      } else {
        bucketsPromise = sb
          .from('bucket_records')
          .select('*')
          .eq('orchard_id', o)
          .gte('scanned_at', NZ_MIDNIGHT)
          .order('scanned_at', { ascending: false })
          .gte('updated_at', since)
          .then(r => {
            if (r.data?.length === 1000) {
              state.truncatedQueries++;
              metrics.event('truncated', { role: this.role, what: 'delta bucket_records (1000 rows, rest lost)' });
            }
            return r.data || [];
          });
      }
    } else {
      pq = pq.eq('status', 'active').is('deleted_at', null).is('deleted_at', null);
      bucketsPromise = fetchAll((f, t) =>
        sb.from('bucket_records').select(bucketSel).eq('orchard_id', o).gte('scanned_at', NZ_MIDNIGHT).order('scanned_at', { ascending: false }).is('deleted_at', null).order('id').range(f, t),
      );
    }
    const [pr, buckets] = await Promise.all([pq, bucketsPromise]);
    if (pr.data) this.crewCount = useDelta ? this.crewCount || pr.data.length : pr.data.length;
    this.bucketCount = useDelta ? this.bucketCount + buckets.length : buckets.length;
    if (!useDelta && this.bucketCount === 0) this.bucketCount = 0;
    this.lastSyncAt = nowIso;

    await sb.from('daily_attendance').select('picker_id, orchard_id, check_in, orchards(name)').eq('date', NZ_DATE).is('check_out', null).is('deleted_at', null).neq('orchard_id', o);
    if (!light) {
      // fetchBlocks: 3 consultas seguidas (en la versión optimizada se cachean: no cambian en el día)
      const s = await sb.from('harvest_seasons').select('id, name, start_date, end_date, status').eq('orchard_id', o).eq('status', 'active').is('deleted_at', null).limit(1);
      const seasonId = s.data?.[0]?.id;
      const bl = await sb.from('orchard_blocks').select('id, name, total_rows, start_row, color_code, status').eq('orchard_id', o).eq('season_id', seasonId);
      const ids = (bl.data || []).map(x => x.id);
      if (ids.length) await sb.from('block_rows').select('id, block_id, row_number, variety, target_buckets').in('block_id', ids);
      this.blocksLoaded = true;
    }
    await sb.from('row_assignments').select('id, row_number, side, assigned_pickers, completion_percentage, team_leader_id').eq('orchard_id', o).eq('status', 'active').is('deleted_at', null);
    await sb.from('bins').select('*').eq('orchard_id', o);
  }

  subscribeRealtime() {
    const sb = this.sb;
    const o = this.orchard_id;
    const role = this.role;
    const onMsg = name => payload => {
      metrics.recordRealtime(role, name, JSON.stringify(payload).length);
      const ts = payload?.commit_timestamp ? Date.parse(payload.commit_timestamp) : null;
      if (ts) state.realtimeLag.push(Date.now() - ts);
    };
    const live = sb.channel(`harvest-live-${o}-${this.label}`);
    live
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bucket_records', filter: `orchard_id=eq.${o}` }, onMsg('bucket_records'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_attendance', filter: `orchard_id=eq.${o}` }, onMsg('daily_attendance'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qc_inspections', filter: `orchard_id=eq.${o}` }, onMsg('qc_inspections'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'row_assignments', filter: `orchard_id=eq.${o}` }, onMsg('row_assignments'))
      .subscribe();
    this.channels.push(live);
    if (!this.messagingSubscribed) {
      const bc = sb
        .channel(`public:broadcasts-${this.label}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts', filter: `orchard_id=eq.${o}` }, onMsg('broadcasts'))
        .subscribe();
      const chatFilter = OPT ? {} : {};
      const chat = sb
        .channel(`my-chat-messages-${this.label}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', ...chatFilter }, payload => {
          onMsg('chat_messages')(payload);
          if (payload?.new?.sender_id !== this.id) {
            // cada mensaje ajeno => my_unread_counts en cada móvil que lo recibe
            this.sb.rpc('my_unread_counts').then(() => {});
          }
        })
        .subscribe();
      this.channels.push(bc, chat);
      this.messagingSubscribed = true;
    }
    if (this.role === 'logistics') {
      const lg = sb.channel(`logistics-realtime-${this.label}`);
      const f = {};
      lg.on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', ...f }, p => {
        onMsg('transport_requests')(p);
        this.onLogisticsEvent();
      })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_vehicles', ...f }, p => {
          onMsg('fleet_vehicles')(p);
          this.onLogisticsEvent();
        })
        .subscribe();
      this.channels.push(lg);
    }
  }

  subscribeLive() {
    const o = this.orchard_id;
    const role = this.role;
    const onMsg = name => payload => metrics.recordRealtime(role, name, JSON.stringify(payload).length);
    const live = this.sb.channel(`harvest-live-${o}-${this.label}-${Math.random()}`);
    live
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bucket_records', filter: `orchard_id=eq.${o}` }, onMsg('bucket_records'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_attendance', filter: `orchard_id=eq.${o}` }, onMsg('daily_attendance'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qc_inspections', filter: `orchard_id=eq.${o}` }, onMsg('qc_inspections'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'row_assignments', filter: `orchard_id=eq.${o}` }, onMsg('row_assignments'))
      .subscribe();
    this.channels.push(live);
  }

  debouncedUnread() {
    if (this._unreadT) return;
    this._unreadT = setTimeout(() => {
      this._unreadT = null;
      this.sb.rpc('my_unread_counts').then(() => {});
    }, (10 * SEC) / SPEED);
  }

  // Pantalla bloqueada / desbloqueada (useHarvestStore visibilitychange)
  async hide() {
    if (!this.visible) return;
    this.visible = false;
    if (OPT) {
      // app optimizada: solo se pausa el canal del huerto; avisos y chat siguen vivos
      const live = this.channels.filter(c => c.topic.includes('harvest-live'));
      for (const c of live) await this.sb.removeChannel(c);
      this.channels = this.channels.filter(c => !c.topic.includes('harvest-live'));
      return;
    }
    await this.sb.removeAllChannels();
    this.channels = [];
    this.messagingSubscribed = false; // el bug: al volver solo se recupera harvest-live
    this.messagingLost = true;
  }

  async show() {
    if (this.visible) return;
    this.visible = true;
    const nowMs = clock.minute() * 60000; // en tiempo virtual
    if (nowMs - this.lastVisibilityRefresh > 180000) {
      this.lastVisibilityRefresh = nowMs;
      await this.sb.auth.refreshSession().catch(() => {});
    }
    if (OPT) {
      this.subscribeLive();
      await this.fetchOrchardData({ catchUp: true }).catch(() => {});
      return;
    }
    // la app: solo vuelve harvest-live (broadcasts y chat no se re-suscriben)
    const live = this.sb.channel(`harvest-live-${this.orchard_id}-${this.label}-${Math.random()}`);
    const role = this.role;
    const onMsg = name => payload => metrics.recordRealtime(role, name, JSON.stringify(payload).length);
    live
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bucket_records', filter: `orchard_id=eq.${this.orchard_id}` }, onMsg('bucket_records'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_attendance', filter: `orchard_id=eq.${this.orchard_id}` }, onMsg('daily_attendance'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'qc_inspections', filter: `orchard_id=eq.${this.orchard_id}` }, onMsg('qc_inspections'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'row_assignments', filter: `orchard_id=eq.${this.orchard_id}` }, onMsg('row_assignments'))
      .subscribe();
    this.channels.push(live);
    await this.fetchOrchardData().catch(e => metrics.event('client_error', { role, what: 'fetchOrchardData', message: String(e.message) }));
  }

  // Teléfono de campo: se bloquea tras 2 min sin uso; cualquier acción lo desbloquea
  async touch() {
    this.lastActive = clock.minute();
    if (!this.visible) {
      if (this._showing) return this._showing;
      this._showing = (async () => {
        await this.show();
        this.hiddenAt = 0;
      })().finally(() => {
        this._showing = null;
      });
      return this._showing;
    }
  }

  async idleWatcher() {
    while (!clock.over()) {
      await clock.sleepV(30 * SEC);
      if (this.visible && clock.minute() - this.lastActive > 2 && this.chatOpenUntil < clock.minute()) {
        this.hiddenAt = clock.minute();
        await this.hide();
      }
    }
  }

  // ----- cola de cubetas + subida (bucket-upload.service.ts + HarvestSyncBridge) -----
  enqueueScan(scan) {
    this.bucketQueue.push({ scan, synced: 0 });
    state.scansCreated++;
    state.scanIds.add(scan.id);
    this.auditQueue.push({
      event_type: 'bucket.scanned',
      severity: 'info',
      action: `Bucket scanned for picker ${scan.picker_id}`,
      orchard_id: scan.orchard_id,
      entity_type: 'bucket',
      entity_id: scan.id,
      details: { quality_grade: scan.quality_grade, picker_id: scan.picker_id },
    });
  }

  async uploadLoop() {
    while (!clock.over() || this.bucketQueue.some(b => b.synced === 0)) {
      await clock.sleepV(5 * SEC);
      if (this.net.offline) continue;
      const pending = this.bucketQueue.filter(b => b.synced === 0);
      if (!pending.length) continue;
      if (this.nextUploadAt && clock.minute() < this.nextUploadAt) continue;
      for (let i = 0; i < pending.length; i += 50) {
        const chunk = pending.slice(i, i + 50);
        try {
          const { data, error } = await this.sb.functions.invoke('record-bucket', {
            body: { scans: chunk.map(c => c.scan), client_now: Date.now() },
          });
          if (error) throw error;
          for (const r of data.results || []) {
            const item = chunk.find(c => c.scan.id === r.id);
            if (!item) continue;
            if (r.status === 'saved' || r.status === 'duplicate') {
              if (item.synced !== 1) state.scansAcked++;
              item.synced = 1;
            } else if (r.status === 'rejected') {
              item.synced = -1;
              state.scansRejected++;
              metrics.event('scan_rejected', { role: this.role, reason: r.reason || r.error });
            }
          }
          // chaos: a veces la respuesta se pierde y el móvil reenvía el mismo lote
          if (CHAOS && Math.random() < 0.03) {
            state.duplicateSends += chunk.length;
            await this.sb.functions.invoke('record-bucket', { body: { scans: chunk.map(c => c.scan), client_now: Date.now() } });
          }
          this.uploadBackoff = 5 * SEC;
          this.nextUploadAt = 0;
        } catch (e) {
          this.uploadBackoff = Math.min(this.uploadBackoff * 2, 300 * SEC);
          this.nextUploadAt = clock.minute() + this.uploadBackoff / MIN;
          break;
        }
      }
    }
  }

  async auditLoop() {
    while (!clock.over() || this.auditQueue.length) {
      await clock.sleepV(5 * SEC);
      if (!this.auditQueue.length || this.net.offline) continue;
      if (OPT) {
        // optimizado: no se manda auditoría por cubeta (record-bucket ya deja rastro: scanned_by + created_at)
        this.auditQueue = this.auditQueue.filter(e => e.event_type !== 'bucket.scanned');
        if (!this.auditQueue.length) continue;
      }
      const entries = this.auditQueue.splice(0, 50);
      const { error } = await this.sb.functions.invoke('submit-audit-log', { body: { entries } });
      if (error) {
        // audit.service: si falla, vuelve a la cola (hasta 50)
        this.auditQueue.unshift(...entries.slice(0, Math.max(0, 50 - this.auditQueue.length)));
      }
    }
  }

  async chatSession(minutes) {
    const conv = this.convId;
    if (!conv) return;
    await this.touch();
    this.chatOpenUntil = clock.minute() + minutes;
    await this.refreshMessages();
    await this.sb.from('users').select('*').order('full_name');
    if (OPT) await this.sb.from('chat_messages').select('*').eq('conversation_id', conv).order('created_at', { ascending: false }).limit(300);
    else await this.sb.from('chat_messages').select('*').eq('conversation_id', conv).order('created_at', { ascending: true });
    await this.sb.rpc('mark_conversation_read', { p_conversation_id: conv });
    const ch = this.sb
      .channel(`chat:${conv}:${this.label}:${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conv}` }, p =>
        metrics.recordRealtime(this.role, 'chat:conversation', JSON.stringify(p).length),
      )
      .subscribe();
    let sincePoll = 0;
    while (clock.minute() < this.chatOpenUntil && !clock.over()) {
      await clock.sleepV(15 * SEC);
      sincePoll += 15;
      this.lastActive = clock.minute();
      // UnifiedMessagingView: refreshMessages cada 15 s (app optimizada: cada 60 s)
      if (!OPT || sincePoll >= 60) {
        sincePoll = 0;
        await this.refreshMessages().catch(() => {});
      }
      if (Math.random() < 0.15) await this.sendChat();
    }
    await this.sb.removeChannel(ch);
  }

  async sendChat() {
    if (!this.convId) return;
    const msg = { id: randomUUID(), conversation_id: this.convId, sender_id: this.id, content: pick(['On my way', 'Row finished', 'Need bins', 'Ok', 'Break in 5', 'Done here']), created_at: new Date().toISOString() };
    const { error } = await this.sb.from('chat_messages').insert(msg).select().single();
    if (!error && !OPT) await this.sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', this.convId);
  }
}

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

// =============================================================================
// Comportamiento por rol
// =============================================================================
const devices = accounts.map(a => new Device(a));
const byRole = r => devices.filter(d => d.role === r);
const orchardIds = [...new Set(accounts.filter(a => a.role === 'manager').map(a => a.orchard_id))];

async function loadReferenceData() {
  // pickers por huerto (lo que ya tiene el móvil tras el arranque)
  const admin = devices.find(d => d.role === 'admin');
  const { data } = await admin.sb.from('pickers').select('id, orchard_id, team_leader_id, role, picker_id').eq('status', 'active').like('picker_id', 'P%');
  for (const p of data || []) {
    if (!/^P\d/.test(p.picker_id)) continue;
    const list = state.pickersByOrchard.get(p.orchard_id) || [];
    list.push({ id: p.id, tl: p.team_leader_id });
    state.pickersByOrchard.set(p.orchard_id, list);
  }
  const convs = await admin.sb.from('conversations').select('id, name, participant_ids').like('name', 'Sim%');
  const office = (await admin.sb.from('conversations').select('id').eq('name', 'Office')).data?.[0]?.id;
  for (const d of devices) {
    const c = (convs.data || []).find(x => (x.participant_ids || []).includes(d.id));
    d.convId = c?.id || (['admin', 'hr_admin', 'payroll_admin', 'logistics'].includes(d.role) ? office : null);
  }
}

// ---------- Team leader ----------
async function teamLeaderDay(d) {
  await clock.until(parseHHMM('06:00') + rnd(0, 15));
  await d.bootstrap();
  const sb = d.sb;
  const crew = (state.pickersByOrchard.get(d.orchard_id) || []).filter(p => p.tl === d.id);
  d.crew = crew;
  // UnclosedShiftsAlert con toda la cuadrilla en la URL
  await sb
    .from('daily_attendance')
    .select('id, picker_id, orchard_id, date, check_in, pickers(name), orchards(name)')
    .is('check_out', null)
    .is('deleted_at', null)
    .not('check_in', 'is', null)
    .lt('date', NZ_DATE)
    .gte('date', daysAgo(30))
    .in('picker_id', crew.map(c => c.id));
  const loadAttendanceTab = async () => {
    await Promise.all([
      sb.from('pickers').select('*').or(`team_leader_id.eq.${d.id}`),
      sb.from('pickers_performance_today').select('*'),
      sb.from('daily_attendance').select('*, picker:pickers(name, role, team_leader_id)').eq('orchard_id', d.orchard_id).eq('date', NZ_DATE).is('deleted_at', null),
    ]);
  };
  await loadAttendanceTab();
  const reloadAttendance = () => sb.from('daily_attendance').select('*, picker:pickers(name, role, team_leader_id)').eq('orchard_id', d.orchard_id).eq('date', NZ_DATE).is('deleted_at', null);

  // Fichaje de entrada uno a uno (06:15–06:40); ~92% viene a trabajar
  await clock.until(parseHHMM('06:15'));
  const present = [];
  for (const p of crew) {
    if (Math.random() > 0.92) continue;
    await d.touch();
    const { data, error } = await sb.functions.invoke('manage-attendance', { body: { action: 'check_in', picker_id: p.id, orchard_id: d.orchard_id, verified_by: d.id } });
    if (error) metrics.event('checkin_failed', { role: d.role, message: String(error.message).slice(0, 120) });
    const attId = data?.attendance?.id || data?.data?.id || data?.id;
    if (attId) state.attendanceByPicker.set(p.id, attId);
    present.push(p);
    // la app invalida las consultas tras cada fichaje (optimizada: solo la de fichajes)
    if (!OPT) await loadAttendanceTab();
    else await reloadAttendance();
    await clock.sleepV(rnd(40, 75) * SEC);
  }
  const pres = state.presentByOrchard.get(d.orchard_id) || [];
  pres.push(...present.map(p => ({ ...p, tlDevice: d })));
  state.presentByOrchard.set(d.orchard_id, pres);

  // Asignación de filas: al empezar, a media mañana y tras comer
  const tlIdx = Number(d.label.split('-')[2]);
  const assign = async rowBase => {
    await d.touch();
    const ids = present.map(p => p.id);
    const raId = randomUUID();
    const prev = d.activeAssignment;
    await sb.from('row_assignments').upsert([{ id: raId, orchard_id: d.orchard_id, row_number: rowBase, side: 'north', assigned_pickers: ids, completion_percentage: 0, team_leader_id: d.id, status: 'active' }], { onConflict: 'id' });
    await sb.from('pickers').update({ current_row: rowBase }).in('id', ids);
    if (prev) await sb.from('row_assignments').update({ status: 'moved', ended_at: new Date().toISOString() }).in('id', [prev]).eq('status', 'active');
    d.activeAssignment = raId;
    d.currentRow = rowBase;
  };
  await clock.until(parseHHMM('06:42'));
  await assign((tlIdx - 1) * 8 + 1);
  scheduleAt(parseHHMM('09:30'), async () => {
    await d.touch();
    await sb.from('row_assignments').update({ completion_percentage: 60 }).eq('id', d.activeAssignment);
  });
  scheduleAt(parseHHMM('10:45'), () => assign((tlIdx - 1) * 8 + 3));
  scheduleAt(parseHHMM('13:30'), () => assign((tlIdx - 1) * 8 + 5));

  // Descanso de comida apuntado por el TL (12:05) — una corrección por persona
  scheduleAt(parseHHMM('12:05'), async () => {
    for (const p of present) {
      const att = state.attendanceByPicker.get(p.id);
      if (!att) continue;
      await d.touch();
      const today = NZ_DATE;
      const { error } = await sb.functions.invoke('manage-attendance', {
        body: { action: 'correct', attendance_id: att, break_start: new Date(Date.now() - 30 * 60000).toISOString(), break_minutes: 30, reason: 'Meal break' },
      });
      if (error) metrics.event('break_failed', { role: d.role, message: String(error.message).slice(0, 160) });
      await reloadAttendance();
      await clock.sleepV(rnd(10, 20) * SEC);
    }
  });

  // Chat: 2–3 ratos al día
  for (const t of ['08:10', '12:10', '14:40']) scheduleAt(parseHHMM(t) + rnd(0, 20), () => d.chatSession(rnd(4, 9)));

  // Salida uno a uno (15:30–16:00) y cierre
  await clock.until(parseHHMM('15:35') + rnd(0, 10));
  for (const p of present) {
    const att = state.attendanceByPicker.get(p.id);
    if (!att) continue;
    await d.touch();
    const { error } = await sb.functions.invoke('manage-attendance', { body: { action: 'check_out', attendance_id: att } });
    if (error) metrics.event('checkout_failed', { role: d.role, message: String(error.message).slice(0, 120) });
    await reloadAttendance();
    await clock.sleepV(rnd(15, 35) * SEC);
  }
  await sb.from('row_assignments').update({ completion_percentage: 100, status: 'completed', ended_at: new Date().toISOString() }).eq('id', d.activeAssignment);
}

// ---------- Escaneo de cubetas (runners 75 %, team leaders 25 %) ----------
async function scanningForOrchard(orchardId) {
  await clock.until(parseHHMM('06:50'));
  const runners = devices.filter(d => d.role === 'runner' && d.orchard_id === orchardId);
  const tls = devices.filter(d => d.role === 'team_leader' && d.orchard_id === orchardId);
  let present = state.presentByOrchard.get(orchardId) || [];
  // 3.5–6.5 cubetas/h por picker
  let totalPerHour = present.reduce(a => a + rnd(3.5, 6.5), 0);
  let binCounter = 0;
  while (clock.minute() < parseHHMM('15:30')) {
    const m = clock.minute();
    const inBreak = m >= parseHHMM('11:30') && m < parseHHMM('12:00');
    if (!totalPerHour) {
      await clock.sleepV(MIN);
      present = state.presentByOrchard.get(orchardId) || [];
      totalPerHour = present.reduce(a => a + rnd(3.5, 6.5), 0);
      continue;
    }
    const meanGapMs = (3600 * SEC) / totalPerHour;
    await clock.sleepV(expo(meanGapMs));
    if (inBreak) continue;
    const p = present[Math.floor(Math.random() * present.length)];
    if (!p) continue;
    const dev = Math.random() < 0.75 ? pick(runners) : p.tlDevice || pick(tls);
    // el escaneo se guarda al instante en el móvil; ponerse al día va en segundo plano
    dev.touch().catch(() => {});
    const q = Math.random();
    const scan = {
      id: randomUUID(),
      picker_id: p.id,
      orchard_id: orchardId,
      quality_grade: q < 0.8 ? 'A' : q < 0.95 ? 'B' : q < 0.99 ? 'C' : 'reject',
      scanned_at: new Date().toISOString(),
      row_number: p.tlDevice?.currentRow || 1,
      scanned_by: dev.id,
    };
    dev.enqueueScan(scan);
    // un bin se llena cada ~35 cubetas: el runner lo marca lleno
    if (++binCounter % 35 === 0 && dev.role === 'runner') {
      const binId = randomUUID();
      dev.sb
        .from('bins')
        .update({ status: 'full', filled_at: new Date().toISOString() })
        .eq('orchard_id', orchardId)
        .eq('bin_code', `B${orchardId === orchardIds[0] ? 1 : orchardId === orchardIds[1] ? 2 : 3}${String(1 + (binCounter / 35) % 200).padStart(4, '0')}`)
        .then(() => {});
      void binId;
    }
  }
}

// ---------- Runner ----------
async function runnerDay(d) {
  await clock.until(parseHHMM('06:10') + rnd(0, 20));
  await d.bootstrap();
  // Peticiones de bins vacíos: ~5 por runner y día
  for (let i = 0; i < 5; i++) {
    scheduleAt(parseHHMM('07:30') + i * 95 + rnd(-20, 20), async () => {
      await d.touch();
      const id = randomUUID();
      const zone = `Block ${pick(['A', 'B', 'C', 'D'])}`;
      const { data, error } = await d.sb
        .from('transport_requests')
        .insert({ id, orchard_id: d.orchard_id, requested_by: d.id, requester_name: d.label, zone, bins_count: 1, priority: Math.random() < 0.1 ? 'high' : 'normal', notes: null })
        .select('id, updated_at')
        .single();
      if (!error && data) state.transportPending.set(id, { orchard_id: d.orchard_id, updated_at: data.updated_at, created: clock.minute() });
      await d.sb.from('broadcasts').insert({ id: randomUUID(), orchard_id: d.orchard_id, sender_id: d.id, title: 'Bins needed', content: `Empty bin needed at ${zone}`, priority: 'normal', target_roles: ['logistics'] });
    });
  }
  for (const t of ['09:15', '13:20']) scheduleAt(parseHHMM(t) + rnd(0, 30), () => d.chatSession(rnd(3, 6)));
}

// ---------- QC ----------
async function qcDay(d) {
  await clock.until(parseHHMM('06:35'));
  await d.bootstrap();
  const sb = d.sb;
  const loadInspections = async () => {
    const sel = '*';
    const q = () => sb.from('qc_inspections').select(sel).eq('orchard_id', d.orchard_id).gte('created_at', NZ_MIDNIGHT).lte('created_at', new Date(Date.parse(NZ_MIDNIGHT) + 86400000).toISOString()).order('created_at', { ascending: false });
    await q();
    if (!OPT) await q(); // getGradeDistribution vuelve a pedir lo mismo
  };
  await loadInspections();
  scheduleAt(parseHHMM('12:20'), async () => {
    // pestaña Tendencias: 7 días, uno a uno (+ hoy)
    for (let i = 7; i >= 0; i--) {
      const start = nzMidnightISO(daysAgo(i));
      const end = new Date(Date.parse(start) + 86400000).toISOString();
      await sb.from('qc_inspections').select('*').eq('orchard_id', d.orchard_id).gte('created_at', start).lte('created_at', end);
    }
  });
  await clock.until(parseHHMM('06:55'));
  while (clock.minute() < parseHHMM('15:30')) {
    await clock.sleepV(rnd(5, 11) * MIN);
    const present = state.presentByOrchard.get(d.orchard_id) || [];
    const p = pick(present);
    if (!p) continue;
    await d.touch();
    const g = Math.random();
    const { error } = await sb
      .from('qc_inspections')
      .insert({ orchard_id: d.orchard_id, picker_id: p.id, inspector_id: d.id, grade: g < 0.8 ? 'A' : g < 0.93 ? 'B' : 'C', notes: Math.random() < 0.1 ? 'Stems missing' : null, photo_url: null })
      .select()
      .single();
    if (error) metrics.event('qc_failed', { message: error.message });
    if (!OPT) await loadInspections();
  }
}

// ---------- Manager ----------
async function managerDay(d) {
  await clock.until(parseHHMM('05:50') + rnd(0, 10));
  await d.bootstrap();
  const sb = d.sb;
  const o = d.orchard_id;
  const notifications = async () => {
    await Promise.all([
      sb.from('hr_documents').select('id, title, expires_at').eq('document_type', 'work_visa').is('deleted_at', null).gte('expires_at', NZ_DATE).lte('expires_at', daysAgo(-30)).limit(5),
      sb.from('qc_inspections').select('grade').gte('created_at', NZ_MIDNIGHT).limit(200),
      sb.from('transport_requests').select('id, created_at').eq('status', 'pending').lte('created_at', new Date(Date.now() - 30 * 60000).toISOString()).limit(3),
    ]);
  };
  const dashboard = async () => {
    await sb.from('daily_attendance').select('id, picker_id, orchard_id, date, check_in, pickers(name), orchards(name)').eq('orchard_id', o).is('check_out', null).is('deleted_at', null).not('check_in', 'is', null).lt('date', NZ_DATE).gte('date', daysAgo(30));
    await sb.from('rejected_scans').select('id, kind, reason, picker_code, scanned_at, created_at, pickers(name), users(full_name)').eq('orchard_id', o).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(200);
    // WageShieldPanel.getDailyBleed(orchard, 7): asistencia + cubetas de 7 días paginadas
    const since = nzMidnightISO(daysAgo(6));
    await fetchAll((f, t) => sb.from('daily_attendance').select('picker_id, date, check_in, check_out, break_minutes').eq('orchard_id', o).gte('date', daysAgo(6)).order('id').range(f, t));
    await fetchAll((f, t) => sb.from('bucket_records').select('picker_id, scanned_at').eq('orchard_id', o).gte('scanned_at', since).is('deleted_at', null).order('id').range(f, t));
  };
  // El manager ficha a sus team leaders y runners (nadie puede ficharse a sí mismo)
  const staff = devices.filter(x => x.orchard_id === o && ['team_leader', 'runner'].includes(x.role));
  for (const s2 of staff) {
    const { data, error } = await sb.functions.invoke('manage-attendance', { body: { action: 'check_in', picker_id: s2.id, orchard_id: o } });
    if (error) metrics.event('checkin_failed', { role: d.role, message: String(error.message).slice(0, 120) });
    if (data?.id) state.attendanceByPicker.set(s2.id, data.id);
    await clock.sleepV(rnd(20, 40) * SEC);
  }
  scheduleAt(parseHHMM('16:05'), async () => {
    for (const s2 of staff) {
      const att = state.attendanceByPicker.get(s2.id);
      if (att) await sb.functions.invoke('manage-attendance', { body: { action: 'check_out', attendance_id: att } });
    }
  });
  await dashboard();
  // notificationService: cada 5 min
  (async () => {
    while (!clock.over()) {
      await notifications().catch(() => {});
      await clock.sleepV(5 * MIN);
    }
  })();
  const weekStart = mondayOf(NZ_DATE);
  const insights = async () => {
    await d.touch();
    await sb.functions.invoke('calculate-payroll', { body: { orchard_id: o, start_date: weekStart, end_date: NZ_DATE } });
    // getDailyTrendsV2: cubetas de la semana paginadas
    await fetchAll((f, t) => sb.from('bucket_records').select('scanned_at, picker_id').eq('orchard_id', o).gte('scanned_at', nzMidnightISO(weekStart)).is('deleted_at', null).order('id').range(f, t));
  };
  scheduleAt(parseHHMM('10:00'), insights);
  scheduleAt(parseHHMM('15:00'), insights);
  scheduleAt(parseHHMM('12:30'), async () => {
    // HeatMap (getRowDensity): sin paginar, se corta en 1000 filas
    if (OPT) {
      // app optimizada: paginado y con medianoche NZ
      await fetchAll((f, t) => sb.from('bucket_records').select('row_number, picker_id, scanned_at').eq('orchard_id', o).is('deleted_at', null).gte('scanned_at', NZ_MIDNIGHT).lte('scanned_at', new Date().toISOString()).order('id').range(f, t));
    } else {
      const r = await sb.from('bucket_records').select('row_number, picker_id, scanned_at').eq('orchard_id', o).gte('scanned_at', NZ_MIDNIGHT).lte('scanned_at', new Date().toISOString());
      if (r.data?.length === 1000) {
        state.truncatedQueries++;
        metrics.event('truncated', { role: 'manager', what: 'heatmap getRowDensity (1000 rows)' });
      }
    }
  });
  for (const t of ['09:00', '13:00', '16:00']) scheduleAt(parseHHMM(t), () => sb.functions.invoke('detect-anomalies', { body: { orchard_id: o } }));
  for (const t of ['06:05', '11:25']) {
    scheduleAt(parseHHMM(t), () =>
      sb.from('broadcasts').insert({ id: randomUUID(), orchard_id: o, sender_id: d.id, title: 'Crew notice', content: 'Hydrate, sunscreen, start at row markers', priority: 'normal', target_roles: ['team_leader', 'runner'] }),
    );
  }
  for (const t of ['07:30', '11:00', '14:00', '16:10']) scheduleAt(parseHHMM(t) + rnd(0, 20), () => d.chatSession(rnd(3, 8)));
  for (const t of ['08:00', '12:45', '15:10']) scheduleAt(parseHHMM(t), dashboard);

  // 16:30 editor de horas: carga + 3 correcciones
  scheduleAt(parseHHMM('16:30'), async () => {
    const r = await sb.from('daily_attendance').select('*, picker:pickers(id, name, picker_id)').eq('orchard_id', o).eq('date', NZ_DATE);
    const rows = (r.data || []).filter(x => x.check_out).slice(0, 3);
    for (const row of rows) {
      await sb.functions.invoke('manage-attendance', { body: { action: 'correct', attendance_id: row.id, check_out: new Date(Date.parse(row.check_out) + 5 * 60000).toISOString(), reason: 'Left late, confirmed by TL' } });
    }
  });
  // 17:00 cierre del día
  scheduleAt(parseHHMM('17:00'), async () => {
    const { data } = await sb.functions.invoke('calculate-payroll', { body: { orchard_id: o, start_date: NZ_DATE, end_date: NZ_DATE } });
    await sb.from('day_closures').insert({ orchard_id: o, date: NZ_DATE, status: 'closed', closed_by: d.id, closed_at: new Date().toISOString(), total_buckets: data?.summary?.total_buckets ?? 0, total_cost: data?.summary?.total_earnings ?? 0, total_hours: data?.summary?.total_hours ?? 0, wage_violations: 0 });
  });
}

// ---------- Oficina ----------
async function payrollDay(d) {
  await clock.until(parseHHMM('08:00'));
  await d.bootstrap();
  const sb = d.sb;
  const weekStart = mondayOf(NZ_DATE);
  const open = async () => {
    await sb.functions.invoke('calculate-payroll', { body: { start_date: weekStart, end_date: daysAgo(-(6 - ((new Date(`${NZ_DATE}T12:00:00Z`).getUTCDay() + 6) % 7))) } });
    // UnclosedShiftsAlert sin filtro: toda la empresa, 30 días
    await sb.from('daily_attendance').select('id, picker_id, orchard_id, date, check_in, pickers(name), orchards(name)').is('check_out', null).is('deleted_at', null).not('check_in', 'is', null).lt('date', NZ_DATE).gte('date', daysAgo(30));
  };
  await open();
  // Aprobación de horas: ayer si hay, si no las de hoy al final del día
  const approveDay = async date => {
    for (const o of orchardIds) {
      const r = await sb.from('daily_attendance').select('id, picker_id, date, check_in, check_out, break_start, break_minutes, verified_by, rejected_at, rejection_reason, orchard_id, updated_at').eq('orchard_id', o).eq('date', date);
      const rows = (r.data || []).filter(x => x.check_out && !x.verified_by);
      await sb.from('pickers').select('id, name, picker_id').in('id', rows.map(x => x.picker_id).slice(0, 300));
      if (OPT) {
        // optimizado: aprobación por lotes (1 llamada por huerto y día)
        if (rows.length) {
          const { data, error } = await sb.functions.invoke('approve-timesheet', { body: { items: rows.map(x => ({ attendance_id: x.id, current_updated_at: x.updated_at })) } });
          if (error || !data?.approved) metrics.event('approve_failed', { message: String(error?.message || 'none approved').slice(0, 160) });
        }
        continue;
      }
      for (const row of rows) {
        const { error } = await sb.functions.invoke('approve-timesheet', { body: { attendance_id: row.id, verified_by: d.id, current_updated_at: row.updated_at } });
        if (error) metrics.event('approve_failed', { message: String(error.message).slice(0, 160) });
        await clock.sleepV(rnd(4, 9) * SEC);
      }
    }
  };
  scheduleAt(parseHHMM('08:30'), () => approveDay(daysAgo(1)));
  scheduleAt(parseHHMM('16:45'), () => approveDay(NZ_DATE));
  scheduleAt(parseHHMM('13:00'), open);
  scheduleAt(parseHHMM('10:00'), () => d.chatSession(5));
}

async function hrDay(d) {
  await clock.until(parseHHMM('08:30'));
  await d.bootstrap();
  const sb = d.sb;
  const weekStart = mondayOf(NZ_DATE);
  const employees = async () => {
    const [p, u] = await Promise.all([
      sb.from('pickers').select('id, name, role, status, created_at, orchard_id, picker_id').is('deleted_at', null),
      sb.from('users').select('id, full_name, email, role, is_active, created_at, orchard_id'),
    ]);
    const ids = [...(p.data || []), ...(u.data || [])].map(x => x.id);
    if (OPT) {
      // app optimizada: por trozos de 100 ids (la URL con 280 ids daba 414)
      for (let i = 0; i < ids.length; i += 100) await sb.from('contracts').select('id, employee_id, type, status, start_date, end_date, hourly_rate, updated_at').in('employee_id', ids.slice(i, i + 100)).in('status', ['active', 'expiring']).is('deleted_at', null);
    } else {
      const r = await sb.from('contracts').select('id, employee_id, type, status, start_date, end_date, hourly_rate, updated_at').in('employee_id', ids).in('status', ['active', 'expiring']).is('deleted_at', null);
      if (r.status === 414) metrics.event('uri_too_long', { role: 'hr_admin', what: `contracts IN ${ids.length} ids` });
    }
    await sb.from('hr_documents').select('id, picker_id, user_id, expires_at, title').eq('document_type', 'work_visa').is('deleted_at', null);
  };
  const alerts = async () => {
    await sb.from('contracts').select('id, employee_id, end_date').eq('status', 'active').lte('end_date', daysAgo(-30)).gte('end_date', NZ_DATE);
    await sb.from('contracts').select('id, employee_id, end_date').eq('status', 'active').lt('end_date', NZ_DATE);
    await sb.from('hr_documents').select('*').is('deleted_at', null).lte('expires_at', daysAgo(-30));
  };
  const pageLoad = async () => {
    const summary = async () => {
      await sb.from('pickers').select('id', { count: 'exact', head: true });
      await sb.from('contracts').select('id, status').in('status', ['draft', 'expiring']);
      await alerts();
      await sb.functions.invoke('calculate-payroll', { body: { start_date: weekStart, end_date: NZ_DATE } });
    };
    if (OPT) {
      await Promise.all([summary(), employees()]);
    } else {
      await Promise.all([
        summary(),
        employees(),
        (async () => {
          await employees();
          await sb.functions.invoke('calculate-payroll', { body: { start_date: weekStart, end_date: NZ_DATE } });
        })(),
        alerts(),
      ]);
    }
  };
  await pageLoad();
  scheduleAt(parseHHMM('09:00'), async () => {
    await sb.from('hr_documents').select('*').is('deleted_at', null);
    await employees();
  });
  scheduleAt(parseHHMM('11:00'), pageLoad);
  scheduleAt(parseHHMM('14:00'), pageLoad);
  scheduleAt(parseHHMM('15:00'), async () => {
    const { data } = await sb.from('contracts').select('id').eq('status', 'active').limit(2);
    for (const c of data || []) await sb.from('contracts').update({ notes: `Reviewed ${NZ_DATE}` }).eq('id', c.id);
  });
}

async function logisticsDay(d) {
  await clock.until(parseHHMM('06:30'));
  const sb = d.sb;
  d.reload = async () => {
    const oFilter = q => q;
    await Promise.all([
      oFilter(sb.from('bins').select('status')),
      oFilter(sb.from('fleet_vehicles').select('status')),
      oFilter(sb.from('transport_requests').select('status').in('status', ['pending', 'assigned'])),
    ]);
    await sb.from('fleet_vehicles').select('*').order('name');
    await sb.from('bins').select('*').order('created_at', { ascending: false }).limit(50);
    await sb.from('transport_requests').select('*').in('status', ['pending', 'assigned', 'in_progress']);
    const hist = await sb.from('transport_requests').select('id, zone, bins_count, created_at, completed_at, assigned_vehicle, requester_name, notes, status').in('status', ['completed', 'cancelled']).order('completed_at', { ascending: false }).limit(50);
    const vids = [...new Set((hist.data || []).map(x => x.assigned_vehicle).filter(Boolean))];
    if (vids.length) await sb.from('fleet_vehicles').select('id, name, driver_name').in('id', vids);
  };
  let reloadQueued = false;
  d.onLogisticsEvent = () => {
    if (OPT) {
      if (reloadQueued) return;
      reloadQueued = true;
      setTimeout(() => {
        reloadQueued = false;
        d.reload().catch(() => {});
      }, (2 * SEC) / SPEED);
    } else d.reload().catch(() => {});
  };
  await d.bootstrap();
  await d.reload();
  // Asigna y completa peticiones (cola TRANSPORT con bloqueo optimista por updated_at)
  while (!clock.over()) {
    await clock.sleepV(2 * MIN);
    for (const [id, t] of state.transportPending) {
      const age = clock.minute() - t.created;
      if (!t.assigned && age > 4) {
        const vehicle = (await sb.from('fleet_vehicles').select('id').eq('orchard_id', t.orchard_id).limit(1)).data?.[0]?.id;
        const { data, error } = await sb.from('transport_requests').update({ assigned_vehicle: vehicle, assigned_by: d.id, status: 'assigned' }).eq('id', id).eq('updated_at', t.updated_at).select('updated_at');
        if (error || !data?.length) metrics.event('transport_conflict', { id, stage: 'assign', error: error?.message });
        else {
          t.updated_at = data[0].updated_at;
          t.assigned = true;
        }
      } else if (t.assigned && age > 20) {
        const { data, error } = await sb.from('transport_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id).eq('updated_at', t.updated_at).select('updated_at');
        if (error || !data?.length) metrics.event('transport_conflict', { id, stage: 'complete', error: error?.message });
        state.transportPending.delete(id);
      }
    }
  }
}

async function adminDay(d) {
  await clock.until(parseHHMM('09:00'));
  await d.bootstrap();
  const sb = d.sb;
  await sb.from('orchards').select('id, name, total_rows').order('name');
  await sb.from('users').select('id, email, full_name, role, is_active, orchard_id, created_at').order('full_name');
  await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  scheduleAt(parseHHMM('14:00'), async () => {
    await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
  });
}

// ---------- caos de red: cortes de cobertura en el campo ----------
async function chaosMonkey() {
  if (!CHAOS) return;
  const field = devices.filter(d => ['runner', 'team_leader', 'qc_inspector'].includes(d.role));
  while (!clock.over()) {
    await clock.sleepV(rnd(10, 25) * MIN);
    const victim = pick(field);
    if (victim.net.offline) continue;
    const mins = rnd(5, 45);
    victim.net.offline = true;
    metrics.event('offline_start', { device: victim.label, minutes: Math.round(mins) });
    clock.sleepV(mins * MIN).then(async () => {
      victim.net.offline = false;
      victim.uploadBackoff = 5 * SEC;
      victim.nextUploadAt = 0;
      // 'online': la app recarga los datos del huerto
      await victim.fetchOrchardData().catch(() => {});
    });
  }
}

// ---------- utilidades de planificación ----------
const pendingTasks = [];
function scheduleAt(minuteOfDay, fn) {
  const p = (async () => {
    await clock.until(minuteOfDay);
    if (clock.minute() > DAY_END + 60) return;
    try {
      await fn();
    } catch (e) {
      metrics.event('task_error', { at: minuteOfDay, message: String(e && e.message).slice(0, 200) });
    }
  })();
  pendingTasks.push(p);
  return p;
}

async function sampleDocker(samples) {
  const { execFile } = await import('node:child_process');
  while (!clock.over()) {
    await new Promise(r => setTimeout(r, 5000));
    await new Promise(res =>
      execFile('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}'], (err, out) => {
        if (!err)
          for (const l of out.trim().split('\n')) {
            const [name, cpu, mem] = l.split('|');
            const s = (samples[name.replace(/^supabase_|_harvestpro-nz$/g, '')] ||= { cpu: [], memMB: [] });
            s.cpu.push(parseFloat(cpu));
            const mb = mem.split('/')[0].trim();
            s.memMB.push(mb.endsWith('GiB') ? parseFloat(mb) * 1024 : parseFloat(mb));
          }
        res();
      }),
    );
  }
}

async function dbStats(sql) {
  const { execFileSync } = await import('node:child_process');
  // la consulta va por stdin (puede ser muy larga: miles de ids)
  return execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-q', '-F', '\t', '-f', '-'], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
    encoding: 'utf8',
    input: sql,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

// =============================================================================
async function main() {
  console.log(`loadsim live day — ${NZ_DATE} speed x${SPEED} variant=${VARIANT}${CHAOS ? ' CHAOS' : ''} devices=${devices.length}`);
  const dbBefore = await dbStats("select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
  await dbStats('select pg_stat_statements_reset()');
  for (const d of devices) await d.login();
  await loadReferenceData();
  realStart = Date.now(); // el reloj virtual empieza cuando todos han iniciado sesión
  const docker = {};
  const dockerP = sampleDocker(docker);

  const roleFns = { team_leader: teamLeaderDay, runner: runnerDay, qc_inspector: qcDay, manager: managerDay, payroll_admin: payrollDay, hr_admin: hrDay, logistics: logisticsDay, admin: adminDay };
  const dayPromises = devices.map(d => roleFns[d.role](d).catch(e => metrics.event('device_crash', { device: d.label, message: String(e && e.stack).slice(0, 400) })));
  const loops = [];
  for (const d of devices) {
    const guard = (name, p) => p.catch(e => metrics.event('loop_crash', { device: d.label, loop: name, message: String(e && e.stack).slice(0, 400) }));
    loops.push(guard('audit', d.auditLoop()));
    if (['runner', 'team_leader', 'qc_inspector'].includes(d.role)) loops.push(guard('idle', d.idleWatcher()));
    if (['runner', 'team_leader'].includes(d.role)) loops.push(guard('upload', d.uploadLoop()));
  }
  const scanP = orchardIds.map(o => scanningForOrchard(o));
  chaosMonkey();
  // progreso
  const progress = setInterval(() => {
    const s = metrics.summary();
    console.log(`[${clock.hhmm()}] reqs=${s.total.calls} err=${s.total.errors} scans=${state.scansCreated}/${state.scansAcked} rt=${s.rtTotal.msgs} MBin=${(s.total.bytesIn / 1e6).toFixed(1)}`);
  }, 30000);

  await Promise.all([...dayPromises, ...scanP]);
  await clock.until(DAY_END);
  await Promise.race([Promise.all(pendingTasks), new Promise(r => setTimeout(r, 120000))]);
  // drenar colas (los móviles terminan de subir)
  const drainDeadline = Date.now() + 180000;
  while (devices.some(d => d.bucketQueue.some(b => b.synced === 0)) && Date.now() < drainDeadline) await new Promise(r => setTimeout(r, 1000));
  await Promise.race([Promise.all(loops), new Promise(r => setTimeout(r, 30000))]);
  clearInterval(progress);
  await dockerP;

  // ---- verificación en la base de datos ----
  // guardar ya lo medido por si la verificación falla
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT.replace(/\.json$/, '.partial.json'), JSON.stringify({ state: { scansCreated: state.scansCreated, scansAcked: state.scansAcked }, ...metrics.summary() }));
  const ids = [...state.scanIds];
  const found = Number(
    await dbStats(`create temp table _ids(id uuid); copy _ids from stdin;\n${ids.join('\n')}\n\\.\nselect count(*) from bucket_records b join _ids using (id);`),
  );
  const dupes = Number(await dbStats(`select count(*) from (select picker_id, scanned_at from bucket_records where scanned_at >= '${NZ_MIDNIGHT}' group by 1,2 having count(*)>1) x`));
  const openShifts = Number(await dbStats(`select count(*) from daily_attendance where date='${NZ_DATE}' and check_out is null and deleted_at is null and orchard_id in (select id from orchards where code like 'SIM%')`));
  const dbAfter = await dbStats("select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
  const topSql = (
    await dbStats(
      "select calls, round(total_exec_time)::bigint, round(mean_exec_time::numeric,2), rows, left(regexp_replace(query, '\\s+', ' ', 'g'), 220) from pg_stat_statements where dbid=(select oid from pg_database where datname='postgres') order by total_exec_time desc limit 40",
    )
  )
    .trim()
    .split('\n')
    .map(l => {
      const [calls, total_ms, mean_ms, rows, query] = l.split('\t');
      return { calls: +calls, total_ms: +total_ms, mean_ms: +mean_ms, rows: +rows, query };
    });

  const lag = [...state.realtimeLag].sort((a, b) => a - b);
  const result = {
    meta: { date: NZ_DATE, speed: SPEED, variant: VARIANT, chaos: CHAOS, devices: devices.length, realSeconds: Math.round((Date.now() - realStart) / 1000) },
    integrity: {
      scansCreated: state.scansCreated,
      scansAcked: state.scansAcked,
      scansRejected: state.scansRejected,
      scansInDb: found,
      scansLost: state.scansCreated - found - state.scansRejected,
      duplicateRowsInDb: dupes,
      duplicateSendsInjected: state.duplicateSends,
      openShiftsAtEnd: openShifts,
      truncatedQueries: state.truncatedQueries,
      pendingInQueues: devices.reduce((a, d) => a + d.bucketQueue.filter(b => b.synced === 0).length, 0),
    },
    realtimeLagMs: { p50: Metrics.pct(lag, 50), p95: Metrics.pct(lag, 95), p99: Metrics.pct(lag, 99), n: lag.length },
    db: { bytesBefore: +dbBefore, bytesAfter: +dbAfter, growthBytes: dbAfter - dbBefore },
    docker: Object.fromEntries(
      Object.entries(docker).map(([k, v]) => [k, { cpuAvg: avg(v.cpu), cpuMax: Math.max(...v.cpu), memMaxMB: Math.round(Math.max(...v.memMB)) }]),
    ),
    ...metrics.summary(),
    topSql,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ integrity: result.integrity, total: result.total, rt: result.rtTotal, lag: result.realtimeLagMs, events: result.eventCounts }, null, 1));
  console.log(`-> ${OUT}`);
  for (const d of devices) await d.sb.removeAllChannels().catch(() => {});
  process.exit(0);
}
function avg(a) {
  return a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
