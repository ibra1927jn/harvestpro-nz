import { describe, it, expect } from 'vitest';
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import type { Employee } from './hhrr.types';
import {
  buildEmployee,
  buildPayrollEntries,
  contractExpiryAlerts,
  contractExpirySeverity,
  documentExpiryAlerts,
  documentExpirySeverity,
  expiredContractAlerts,
  latestVisaFor,
  visaStatusOf,
  type StaffPerson,
} from './hrLogic';

const person = (over: Partial<StaffPerson> = {}): StaffPerson => ({
  id: 'p1',
  full_name: 'Aroha Smith',
  email: 'a@x.nz',
  role: 'picker',
  active: true,
  created_at: '2026-09-01T00:00:00Z',
  source: 'staff',
  ...over,
});

const NOW = '2026-10-13T00:00:00.000Z';

describe('employees', () => {
  it('picks the visa with the latest expiry for that person', () => {
    const visas = [
      { picker_id: 'p1', user_id: null, expires_at: '2026-12-01' },
      { picker_id: null, user_id: 'p1', expires_at: '2027-05-01' },
      { picker_id: 'p2', user_id: null, expires_at: '2030-01-01' },
    ];
    expect(latestVisaFor('p1', visas)?.expires_at).toBe('2027-05-01');
    expect(latestVisaFor('p9', visas)).toBeUndefined();
  });

  it('visa status: none recorded, expired, or valid (NZ date comparison)', () => {
    expect(visaStatusOf(undefined, '2026-10-13')).toBe('not_recorded');
    expect(visaStatusOf({ picker_id: 'p1', user_id: null, expires_at: '2026-10-12' }, '2026-10-13')).toBe('expired');
    expect(visaStatusOf({ picker_id: 'p1', user_id: null, expires_at: '2026-10-13' }, '2026-10-13')).toBe('work_visa');
    expect(visaStatusOf({ picker_id: 'p1', user_id: null, expires_at: null }, '2026-10-13')).toBe('work_visa');
  });

  it('uses the active contract when there is one', () => {
    const e = buildEmployee(
      person(),
      [{ id: 'c1', employee_id: 'p1', type: 'permanent', start_date: '2026-01-01', end_date: '2027-01-01', hourly_rate: 28, updated_at: '2026-02-01' }],
      [],
      '2026-10-13',
      NOW
    );
    expect(e).toMatchObject({
      status: 'active',
      contract_type: 'permanent',
      contract_start: '2026-01-01',
      contract_end: '2027-01-01',
      hourly_rate: 28,
      contract_id: 'c1',
      contract_updated_at: '2026-02-01',
      visa_status: 'not_recorded',
      hire_date: '2026-09-01T00:00:00Z',
    });
  });

  it('without a contract: seasonal at minimum wage from the hire date', () => {
    const e = buildEmployee(person({ active: false, created_at: undefined }), [], [], '2026-10-13', NOW);
    expect(e.status).toBe('terminated');
    expect(e.contract_type).toBe('seasonal');
    expect(e.hourly_rate).toBe(NZ_MINIMUM_WAGE_2026);
    expect(e.contract_start).toBe(NOW);
    expect(e.contract_end).toBeUndefined();
  });
});

describe('weekly payroll entries', () => {
  const emp = (over: Partial<Employee>): Employee => ({
    id: 'p1', full_name: 'A', email: '', role: 'picker', status: 'active', contract_type: 'seasonal',
    contract_start: '', hourly_rate: 23.95, visa_status: 'not_recorded', hire_date: '', ...over,
  });
  const week = { start: '2026-10-05', end: '2026-10-11' };

  it('lists active people and anyone who was paid, not inactive people without pay', () => {
    const out = buildPayrollEntries(
      [emp({ id: 'a' }), emp({ id: 'b', status: 'terminated' }), emp({ id: 'c', status: 'terminated' })],
      [{ id: 'b', hours: 8, buckets: 40, piece: 260, topUp: 0, total: 260 }],
      23.95,
      week
    );
    expect(out.map(e => e.employee_id)).toEqual(['a', 'b']);
    expect(out[0]).toMatchObject({ hours_worked: 0, total_pay: 0, wage_shield_applied: false, period_start: '2026-10-05', period_end: '2026-10-11' });
  });

  it('hourly earnings use the contract rate when it is above the minimum', () => {
    const [hi, lo] = buildPayrollEntries(
      [emp({ id: 'hi', hourly_rate: 30 }), emp({ id: 'lo', hourly_rate: 20 })],
      [
        { id: 'hi', hours: 7.5, buckets: 0, piece: 0, topUp: 225, total: 225 },
        { id: 'lo', hours: 7.5, buckets: 0, piece: 0, topUp: 0, total: 179.63 },
      ],
      23.95,
      week
    );
    expect(hi.hourly_earnings).toBe(225);
    expect(hi.wage_shield_applied).toBe(true);
    expect(lo.hourly_earnings).toBe(179.63);
    expect(lo.wage_shield_applied).toBe(false);
  });
});

describe('alerts', () => {
  it('severity thresholds', () => {
    expect([6, 7, 13, 14].map(contractExpirySeverity)).toEqual(['critical', 'high', 'high', 'medium']);
    expect([-1, 0, 6, 7].map(documentExpirySeverity)).toEqual(['critical', 'high', 'high', 'medium']);
  });

  it('contract expiry: days left, name fallback', () => {
    const nowMs = Date.parse('2026-10-13T00:00:00Z');
    const [a] = contractExpiryAlerts(
      [{ id: 'c1', employee_id: 'p1', type: 'seasonal', end_date: '2026-10-23' }],
      {},
      nowMs
    );
    expect(a).toMatchObject({
      id: 'contract-c1',
      severity: 'high',
      employee_name: 'Unknown',
      message: 'seasonal contract expires in 10 days (2026-10-23)',
      resolved: false,
    });
  });

  it('expired but active contracts are critical', () => {
    const [a] = expiredContractAlerts([{ id: 'c2', employee_id: 'p1' }], { p1: 'Aroha' }, NOW);
    expect(a).toMatchObject({ id: 'expired-c2', severity: 'critical', employee_name: 'Aroha', created_at: NOW });
  });

  it('documents: visas vs other documents, expired vs expiring, skips undated', () => {
    const out = documentExpiryAlerts(
      [
        { id: 'd1', picker_id: 'p1', user_id: null, document_type: 'work_visa', expires_at: '2026-10-10' },
        { id: 'd2', picker_id: null, user_id: 'u1', document_type: 'first_aid', expires_at: '2026-10-20' },
        { id: 'd3', picker_id: 'p1', user_id: null, document_type: 'first_aid', expires_at: null },
      ],
      { p1: 'Aroha', u1: 'Ben' },
      '2026-10-13',
      { work_visa: 'Work Visa', first_aid: 'First Aid' },
      NOW
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: 'visa_expiry', severity: 'critical', message: 'Work Visa expired 3 days ago (2026-10-10)' });
    expect(out[1]).toMatchObject({ type: 'missing_document', severity: 'medium', employee_name: 'Ben', message: 'First Aid expires in 7 days (2026-10-20)' });
  });
});
