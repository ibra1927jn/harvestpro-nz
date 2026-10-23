/**
 * push-messages — Texto de cada aviso push en el idioma de quien lo recibe.
 *
 * La bandeja (notification_outbox) guarda tipo + parámetros; aquí se escribe el
 * título y el cuerpo en en / es / fr (los idiomas de la app). Sin imports:
 * lo usan send-push (Deno) y los tests (Vitest).
 */

export type PushType =
  | 'qc_reject'
  | 'broadcast'
  | 'transport_new'
  | 'transport_assigned'
  | 'transport_completed'
  | 'timesheet_rejected'
  | 'leave_decided'
  | 'chat_message';

/** Casilla de Ajustes que silencia el tipo (null = no se puede silenciar por tipo) */
export type MuteCategory = 'qc_reject' | 'transport' | 'attendance' | 'visa_expiry';

export type PushLocale = 'en' | 'es' | 'fr';

export type PushParams = Record<string, unknown>;

export interface RenderedPush {
  title: string;
  body: string;
}

export const MUTE_CATEGORY: Record<PushType, MuteCategory | null> = {
  qc_reject: 'qc_reject',
  broadcast: null,
  transport_new: 'transport',
  transport_assigned: 'transport',
  transport_completed: 'transport',
  timesheet_rejected: 'attendance',
  leave_decided: null,
  chat_message: null,
};

/** Pantalla de inicio de cada rol (la ruta de la app) */
const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  manager: '/manager',
  team_leader: '/team-leader',
  runner: '/runner',
  qc_inspector: '/qc',
  hr_admin: '/hhrr',
  payroll_admin: '/payroll',
  logistics: '/logistics-dept',
};

export function roleHome(role: string | null | undefined): string {
  return (role && ROLE_HOME[role]) || '/';
}

export function pushLocale(preferred: string | null | undefined): PushLocale {
  const base = (preferred ?? '').toLowerCase().slice(0, 2);
  return base === 'es' || base === 'fr' ? base : 'en';
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** «2026-10-23» → «23/10» (sin depender de Intl en el runtime) */
const shortDate = (v: unknown): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  return m ? `${m[3]}/${m[2]}` : str(v);
};

type Dict = Record<PushLocale, (p: PushParams) => RenderedPush>;

const GRADE: Record<PushLocale, (g: string) => string> = {
  en: g => (g === 'reject' ? 'rejected' : `grade ${g}`),
  es: g => (g === 'reject' ? 'rechazada' : `nota ${g}`),
  fr: g => (g === 'reject' ? 'refusée' : `note ${g}`),
};

const LEAVE_STATUS: Record<PushLocale, (s: string) => string> = {
  en: s => (s === 'approved' ? 'approved' : 'rejected'),
  es: s => (s === 'approved' ? 'aprobada' : 'rechazada'),
  fr: s => (s === 'approved' ? 'approuvée' : 'refusée'),
};

const TEMPLATES: Record<PushType, Dict> = {
  qc_reject: {
    en: p => ({ title: `QC: ${str(p.picker_name)}`, body: `Inspection ${GRADE.en(str(p.grade))}${p.row ? ` · row ${str(p.row)}` : ''}. Tap to review.` }),
    es: p => ({ title: `QC: ${str(p.picker_name)}`, body: `Inspección ${GRADE.es(str(p.grade))}${p.row ? ` · fila ${str(p.row)}` : ''}. Toca para revisarla.` }),
    fr: p => ({ title: `QC\u00a0: ${str(p.picker_name)}`, body: `Inspection ${GRADE.fr(str(p.grade))}${p.row ? ` · rang ${str(p.row)}` : ''}. Touchez pour la consulter.` }),
  },
  broadcast: {
    en: p => ({ title: str(p.title) || 'New announcement', body: str(p.content) }),
    es: p => ({ title: str(p.title) || 'Nuevo aviso', body: str(p.content) }),
    fr: p => ({ title: str(p.title) || 'Nouvelle annonce', body: str(p.content) }),
  },
  transport_new: {
    en: p => ({ title: 'New transport request', body: `${str(p.requester_name)} · ${str(p.zone)} · ${str(p.bins)} bin(s)` }),
    es: p => ({ title: 'Nueva solicitud de transporte', body: `${str(p.requester_name)} · ${str(p.zone)} · ${str(p.bins)} bin(s)` }),
    fr: p => ({ title: 'Nouvelle demande de transport', body: `${str(p.requester_name)} · ${str(p.zone)} · ${str(p.bins)} bac(s)` }),
  },
  transport_assigned: {
    en: p => ({ title: 'Transport on its way', body: `Your request for ${str(p.zone)} has been assigned.` }),
    es: p => ({ title: 'Transporte en camino', body: `Tu solicitud para ${str(p.zone)} ya tiene vehículo.` }),
    fr: p => ({ title: 'Transport en route', body: `Votre demande pour ${str(p.zone)} a été attribuée.` }),
  },
  transport_completed: {
    en: p => ({ title: 'Transport completed', body: `Your request for ${str(p.zone)} is done.` }),
    es: p => ({ title: 'Transporte completado', body: `Tu solicitud para ${str(p.zone)} está hecha.` }),
    fr: p => ({ title: 'Transport terminé', body: `Votre demande pour ${str(p.zone)} est terminée.` }),
  },
  timesheet_rejected: {
    en: p => ({ title: `Timesheet rejected: ${str(p.picker_name)}`, body: `${shortDate(p.date)}${str(p.reason) ? ` · ${str(p.reason)}` : ''}` }),
    es: p => ({ title: `Hoja de horas rechazada: ${str(p.picker_name)}`, body: `${shortDate(p.date)}${str(p.reason) ? ` · ${str(p.reason)}` : ''}` }),
    fr: p => ({ title: `Feuille d’heures refusée\u00a0: ${str(p.picker_name)}`, body: `${shortDate(p.date)}${str(p.reason) ? ` · ${str(p.reason)}` : ''}` }),
  },
  leave_decided: {
    en: p => ({ title: `Leave ${LEAVE_STATUS.en(str(p.status))}`, body: `${str(p.picker_name)} · ${shortDate(p.start_date)}–${shortDate(p.end_date)}` }),
    es: p => ({ title: `Ausencia ${LEAVE_STATUS.es(str(p.status))}`, body: `${str(p.picker_name)} · ${shortDate(p.start_date)}–${shortDate(p.end_date)}` }),
    fr: p => ({ title: `Absence ${LEAVE_STATUS.fr(str(p.status))}`, body: `${str(p.picker_name)} · ${shortDate(p.start_date)}–${shortDate(p.end_date)}` }),
  },
  // En privado nunca el texto (la pantalla bloqueada la ve cualquiera)
  chat_message: {
    en: p => p.conversation_type === 'direct' || !str(p.preview)
      ? { title: 'HarvestPro', body: `New message from ${str(p.sender_name)}` }
      : { title: str(p.conversation_name) || 'Group chat', body: `${str(p.sender_name)}: ${str(p.preview)}` },
    es: p => p.conversation_type === 'direct' || !str(p.preview)
      ? { title: 'HarvestPro', body: `Nuevo mensaje de ${str(p.sender_name)}` }
      : { title: str(p.conversation_name) || 'Chat de grupo', body: `${str(p.sender_name)}: ${str(p.preview)}` },
    fr: p => p.conversation_type === 'direct' || !str(p.preview)
      ? { title: 'HarvestPro', body: `Nouveau message de ${str(p.sender_name)}` }
      : { title: str(p.conversation_name) || 'Discussion de groupe', body: `${str(p.sender_name)}\u00a0: ${str(p.preview)}` },
  },
};

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function renderPush(type: PushType, params: PushParams, locale: PushLocale): RenderedPush {
  const t = TEMPLATES[type]?.[locale] ?? TEMPLATES[type]?.en;
  const out = t ? t(params ?? {}) : { title: 'HarvestPro', body: '' };
  return { title: clip(out.title, 120), body: clip(out.body, 300) };
}
