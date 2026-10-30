import { describe, it, expect } from 'vitest';
import type { Employee } from '@/services/hhrr/hhrr.types';
import type { LeaveRequest } from '@/services/leave.service';
import {
    addMonths, buildAgendaEvents, eventsOn, holidaysBetween, lastOfMonth, mondayOf, monthGrid,
    shownInGrid, visibleRange, weekOf,
} from './agendaLogic';

const emp = (over: Partial<Employee>): Employee => ({
    id: 'p1', full_name: 'Aroha', email: '', role: 'picker', status: 'active', contract_type: 'seasonal',
    contract_start: '2026-01-01', hourly_rate: 23.95, visa_status: 'not_recorded', hire_date: '2026-01-01', ...over,
});

const leave = (over: Partial<LeaveRequest>): LeaveRequest => ({
    id: 'l1', orchard_id: 'o1', picker_id: 'p1', type: 'annual', start_date: '2026-10-20', end_date: '2026-10-22',
    half_day: false, reason: null, status: 'requested', requested_by: null, decided_by: null, decided_at: null,
    decision_note: null, created_at: '', updated_at: '', ...over,
});

describe('calendar maths (NZ calendar days, Monday-first)', () => {
    it('month helpers', () => {
        expect(lastOfMonth('2026-02')).toBe('2026-02-28');
        expect(lastOfMonth('2028-02')).toBe('2028-02-29');
        expect(addMonths('2026-12', 1)).toBe('2027-01');
        expect(addMonths('2026-01', -1)).toBe('2025-12');
    });

    it('week of a date runs Monday to Sunday', () => {
        expect(mondayOf('2026-10-22')).toBe('2026-10-19'); // jueves → lunes
        expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // domingo → lunes anterior
        expect(mondayOf('2026-10-19')).toBe('2026-10-19');
        expect(weekOf('2026-10-22')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    });

    it('month grid covers whole weeks around the month', () => {
        const grid = monthGrid('2026-10'); // 1 Oct 2026 es jueves
        expect(grid[0][0]).toBe('2026-09-28');
        expect(grid[grid.length - 1][6]).toBe('2026-11-01');
        expect(grid.every(r => r.length === 7)).toBe(true);
        expect(grid).toHaveLength(5);
        expect(visibleRange('month', '2026-10-22')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
        expect(visibleRange('week', '2026-10-22')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    });

    it('NZ public holidays in a range', () => {
        expect(holidaysBetween('2026-10-01', '2026-10-31')).toEqual(['2026-10-26']); // Labour Day
        expect(holidaysBetween('2026-12-20', '2027-01-05')).toEqual(['2026-12-25', '2026-12-28', '2027-01-01', '2027-01-04']);
    });
});

describe('agenda events', () => {
    const employees = [
        emp({ id: 'p1', full_name: 'Aroha', visa_status: 'work_visa', visa_expiry: '2026-10-30', contract_id: 'c1', contract_end: '2026-10-24' }),
        emp({ id: 'p2', full_name: 'Ben', visa_status: 'work_visa', visa_expiry: '2027-03-01' }),
        emp({ id: 'p3', full_name: 'Gone', status: 'terminated', contract_id: 'c3', contract_end: '2026-10-21' }),
    ];
    const leaves = [
        leave({ id: 'l1', picker_id: 'p1' }),
        leave({ id: 'l2', picker_id: 'p2', status: 'approved', type: 'sick', start_date: '2026-09-30', end_date: '2026-10-01' }),
        leave({ id: 'l3', picker_id: 'p2', status: 'rejected', start_date: '2026-10-05', end_date: '2026-10-05' }),
        leave({ id: 'l4', picker_id: 'p9', status: 'approved', start_date: '2026-11-10', end_date: '2026-11-12' }),
    ];

    it('includes leaves overlapping the range, visa/contract expiries of staff on the books, and holidays, sorted by date', () => {
        const events = buildAgendaEvents(employees, leaves, '2026-10-01', '2026-10-31');
        expect(events.map(e => e.id)).toEqual([
            'leave-l2',        // empieza el 30-09, termina el 01-10: toca el rango
            'leave-l3',
            'leave-l1',
            'contract-p1',
            'holiday-2026-10-26',
            'visa-p1',
        ]);
        const l1 = events.find(e => e.id === 'leave-l1');
        expect(l1).toMatchObject({ kind: 'leave', personName: 'Aroha', date: '2026-10-20', endDate: '2026-10-22' });
        // La baja (p3) no sale; el visado de Ben vence fuera del rango; l4 no toca el rango
        expect(events.some(e => e.id === 'contract-p3')).toBe(false);
        expect(events.some(e => e.id === 'visa-p2')).toBe(false);
    });

    it('eventsOn returns everything that touches the day; the grid hides rejected/cancelled leaves', () => {
        const events = buildAgendaEvents(employees, leaves, '2026-10-01', '2026-10-31');
        expect(eventsOn(events, '2026-10-21').map(e => e.id)).toEqual(['leave-l1']);
        expect(eventsOn(events, '2026-10-26').map(e => e.kind)).toEqual(['holiday']);
        expect(eventsOn(events, '2026-10-05').map(e => e.id)).toEqual(['leave-l3']);
        expect(eventsOn(events, '2026-10-05').filter(shownInGrid)).toEqual([]);
        expect(eventsOn(events, '2026-10-20').filter(shownInGrid).map(e => e.id)).toEqual(['leave-l1']);
    });

    it('names fall back to a dash when the person is not in the list', () => {
        const [ev] = buildAgendaEvents(employees, [leave({ id: 'lx', picker_id: 'unknown' })], '2026-10-01', '2026-10-31');
        expect(ev).toMatchObject({ kind: 'leave', personName: '—' });
    });
});
