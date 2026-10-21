/**
 * agendaLogic — cálculo puro de la Agenda de RRHH (sin React ni Supabase):
 * cuadrícula del mes, semana, y los eventos de cada día (ausencias,
 * vencimientos de visado y contrato, festivos NZ).
 * Las fechas son días de calendario NZ 'YYYY-MM-DD'; no se usan zonas.
 */
import { isPublicHoliday } from '@/constants/nz-law';
import { addDaysYMD } from '@/utils/nzst';
import type { Employee } from '@/services/hhrr/hhrr.types';
import type { LeaveRequest } from '@/services/leave.service';

export type AgendaView = 'month' | 'week';

export type AgendaEvent =
    | { kind: 'leave'; id: string; date: string; endDate: string; personId: string; personName: string; leave: LeaveRequest }
    | { kind: 'visa'; id: string; date: string; endDate: string; personId: string; personName: string }
    | { kind: 'contract'; id: string; date: string; endDate: string; personId: string; personName: string }
    | { kind: 'holiday'; id: string; date: string; endDate: string };

/** 'YYYY-MM' de una fecha */
export const monthOf = (ymd: string): string => ymd.slice(0, 7);

/** Primer día del mes */
export const firstOfMonth = (ym: string): string => `${ym}-01`;

/** Último día del mes */
export function lastOfMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Suma meses a 'YYYY-MM' */
export function addMonths(ym: string, n: number): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Lunes de la semana de esa fecha (semana NZ: lunes–domingo) */
export function mondayOf(ymd: string): string {
    const day = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = domingo
    return addDaysYMD(ymd, day === 0 ? -6 : 1 - day);
}

/** Los 7 días (lunes–domingo) de la semana de esa fecha */
export function weekOf(ymd: string): string[] {
    const monday = mondayOf(ymd);
    return Array.from({ length: 7 }, (_, i) => addDaysYMD(monday, i));
}

/**
 * Cuadrícula del mes: filas de 7 días (lunes–domingo) desde el lunes de la
 * semana del día 1 hasta el domingo de la semana del último día. Los días de
 * los meses vecinos van incluidos (la pantalla los pinta en gris).
 */
export function monthGrid(ym: string): string[][] {
    const start = mondayOf(firstOfMonth(ym));
    const last = lastOfMonth(ym);
    const rows: string[][] = [];
    for (let d = start; d <= last; d = addDaysYMD(d, 7)) rows.push(weekOf(d));
    return rows;
}

/** Rango visible: para el mes, la cuadrícula entera; para la semana, lunes–domingo */
export function visibleRange(view: AgendaView, cursor: string): { from: string; to: string } {
    if (view === 'week') {
        const days = weekOf(cursor);
        return { from: days[0], to: days[6] };
    }
    const rows = monthGrid(monthOf(cursor));
    return { from: rows[0][0], to: rows[rows.length - 1][6] };
}

/** Días festivos NZ dentro de un rango */
export function holidaysBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDaysYMD(d, 1)) if (isPublicHoliday(d)) out.push(d);
    return out;
}

/**
 * Eventos del rango: ausencias (solicitadas y aprobadas en la cuadrícula; en la
 * lista semanal también rechazadas y canceladas, se filtran fuera), vencimientos
 * de visado y de contrato de la plantilla (no de las bajas) y festivos NZ.
 */
export function buildAgendaEvents(
    employees: ReadonlyArray<Employee>,
    leaves: ReadonlyArray<LeaveRequest>,
    from: string,
    to: string
): AgendaEvent[] {
    const nameOf = new Map(employees.map(e => [e.id, e.full_name]));
    const out: AgendaEvent[] = [];

    for (const l of leaves) {
        if (l.end_date < from || l.start_date > to) continue;
        out.push({
            kind: 'leave', id: `leave-${l.id}`, date: l.start_date, endDate: l.end_date,
            personId: l.picker_id, personName: nameOf.get(l.picker_id) ?? '—', leave: l,
        });
    }
    for (const e of employees) {
        if (e.status === 'terminated') continue;
        if (e.visa_expiry && e.visa_status !== 'not_recorded' && e.visa_expiry >= from && e.visa_expiry <= to) {
            out.push({ kind: 'visa', id: `visa-${e.id}`, date: e.visa_expiry, endDate: e.visa_expiry, personId: e.id, personName: e.full_name });
        }
        if (e.contract_id && e.contract_end && e.contract_end >= from && e.contract_end <= to) {
            out.push({ kind: 'contract', id: `contract-${e.id}`, date: e.contract_end, endDate: e.contract_end, personId: e.id, personName: e.full_name });
        }
    }
    for (const h of holidaysBetween(from, to)) {
        out.push({ kind: 'holiday', id: `holiday-${h}`, date: h, endDate: h });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Eventos que tocan un día concreto */
export function eventsOn(events: ReadonlyArray<AgendaEvent>, ymd: string): AgendaEvent[] {
    return events.filter(e => e.date <= ymd && ymd <= e.endDate);
}

/** Ausencias que se enseñan en la cuadrícula del mes (las decididas en contra no) */
export function shownInGrid(event: AgendaEvent): boolean {
    return event.kind !== 'leave' || event.leave.status === 'requested' || event.leave.status === 'approved';
}
