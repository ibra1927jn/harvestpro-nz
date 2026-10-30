/**
 * Historial del picker: un día que la persona trabajó también en otro huerto
 * cuyas filas esta cuenta no lee (manager, migración 20261027070000) muestra
 * las horas y cubetas de aquí y «—» en el pago, con el motivo.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryTab from './HistoryTab';
import type { PickerHistory } from '@/services/picker-history.service';

const history = (records: PickerHistory['dailyRecords']): PickerHistory => ({
    profile: { id: 'p1', picker_id: 'P-1', name: 'Ana', team_leader_id: null, team_leader_name: null, status: 'active', created_at: '2026-01-01' },
    todayBuckets: 0, todayHours: 0, todayEarnings: 0,
    dailyRecords: records,
    quality: { total: 0, gradeA: 0, gradeB: 0, gradeC: 0, reject: 0, score: 0, flaggedCriteria: [] },
    riskBadges: [], teamLeadersWorkedWith: [], varietiesPicked: [],
});
const rec = { buckets: 10, hours: 4, variety: null, team_leader_name: null, orchard_name: 'Alpha' };

describe('HistoryTab — day partly in another orchard', () => {
    it('shows this orchard\'s hours and buckets and "—" with the reason', () => {
        render(<HistoryTab dailyBuckets={[]} history={history([
            { ...rec, date: '2026-10-12', earnings: 100 },
            { ...rec, date: '2026-10-13', earnings: null, partElsewhere: true },
        ])} />);
        const dash = screen.getByTestId('history-part-elsewhere-2026-10-13');
        expect(dash.textContent).toBe('—');
        expect(dash.getAttribute('title')).toMatch(/another orchard/i);
        expect(dash.getAttribute('title')).toMatch(/Payroll/);
        expect(screen.getByText('$100')).toBeTruthy();
    });

    it('a day with an unreadable price keeps its own reason', () => {
        render(<HistoryTab dailyBuckets={[]} history={history([{ ...rec, date: '2026-10-13', earnings: null }])} />);
        expect(screen.queryByTestId('history-part-elsewhere-2026-10-13')).toBeNull();
        expect(screen.getByTitle(/whose price you cannot see/)).toBeTruthy();
    });
});
