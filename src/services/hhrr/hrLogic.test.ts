import { describe, it, expect } from 'vitest';
import { NZ_MINIMUM_WAGE_2026 } from '@/constants/nz-law';
import type { Employee } from './hhrr.types';
import {
  CONTRACT_TYPES,
  EMPLOYEE_STATUSES,
  VISA_STATUSES,
  buildEmployee,
  buildPayrollEntries,
  contractExpiryAlerts,
  contractExpirySeverity,
  documentExpiryAlerts,
  documentExpirySeverity,
  domainOptions,
  employeeStatusOf,
  expiredContractAlerts,
  latestVisaFor,
  missingOnboardingItems,
  pendingContractIds,
  signedCopyOf,
  visaStatusOf,
  type PersonDoc,
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
      // Contrato sí, copia firmada no → alta pendiente
      status: 'pending',
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

  it('attaches the signed copy of the current contract (employment_agreement linked by contract_id)', () => {
    const contract = { id: 'c1', employee_id: 'p1', type: 'seasonal', start_date: '2026-01-01', end_date: '2027-01-01', hourly_rate: 25, updated_at: null };
    const docs = [
      doc({ id: 'd-other', contract_id: 'c9' }),
      doc({ id: 'd-visa', document_type: 'work_visa', contract_id: null }),
      doc({ id: 'd-signed', contract_id: 'c1', storage_path: 'o1/employment_agreement/1-x.pdf' }),
    ];
    const e = buildEmployee(person(), [contract], [], '2026-10-13', NOW, { documents: docs });
    expect(e.contract_document).toEqual({ id: 'd-signed', storage_path: 'o1/employment_agreement/1-x.pdf' });
    expect(buildEmployee(person(), [contract], [], '2026-10-13', NOW).contract_document).toBeUndefined();
  });
});

describe('employee status and onboarding (filters with a fixed domain)', () => {
  const contract = { id: 'c1', employee_id: 'p1', type: 'seasonal', start_date: '2026-01-01', end_date: '2027-01-01', hourly_rate: 25, updated_at: null };
  const signed = doc({ contract_id: 'c1', expires_at: '2027-01-01' });

  it('domainOptions keeps every value of the domain with its count (0 included), in domain order', () => {
    expect(domainOptions(EMPLOYEE_STATUSES, ['active', 'active', 'terminated'])).toEqual([
      { value: 'active', count: 2 },
      { value: 'on_leave', count: 0 },
      { value: 'pending', count: 0 },
      { value: 'terminated', count: 1 },
    ]);
    expect(domainOptions(CONTRACT_TYPES, [])).toEqual([
      { value: 'permanent', count: 0 }, { value: 'seasonal', count: 0 }, { value: 'casual', count: 0 },
    ]);
    expect(VISA_STATUSES).toEqual(['work_visa', 'expired', 'not_recorded']);
  });

  it('missingOnboardingItems: contract, signed copy, visa, IR330 and H&S certificate', () => {
    const today = '2026-10-13';
    const me = { id: 'p1', visa_status: 'work_visa' as const };
    expect(missingOnboardingItems(me, [], undefined, today)).toEqual(['contract', 'tax_declaration', 'health_safety_cert']);
    expect(missingOnboardingItems(me, [], contract, today)).toEqual(['signed_copy', 'tax_declaration', 'health_safety_cert']);
    expect(missingOnboardingItems({ ...me, visa_status: 'expired' }, [signed], contract, today)).toEqual(['visa', 'tax_declaration', 'health_safety_cert']);
    const complete = [
      signed,
      doc({ id: 'ird', document_type: 'tax_declaration', contract_id: null }),
      doc({ id: 'hs', document_type: 'health_safety_cert', contract_id: null, expires_at: '2027-01-01' }),
    ];
    expect(missingOnboardingItems(me, complete, contract, today)).toEqual([]);
    // Certificado caducado = falta; documentos de otra persona no cuentan
    expect(missingOnboardingItems(me, [...complete.slice(0, 2), doc({ id: 'hs-old', document_type: 'health_safety_cert', contract_id: null, expires_at: '2026-01-01' })], contract, today)).toEqual(['health_safety_cert']);
    expect(missingOnboardingItems(me, complete.map(d => ({ ...d, picker_id: 'p2' })), contract, today)).toEqual(['signed_copy', 'tax_declaration', 'health_safety_cert']);
  });

  it('employeeStatusOf: terminated > on_leave > pending (contract or signed copy) > active', () => {
    expect(employeeStatusOf(false, true, [])).toBe('terminated');
    expect(employeeStatusOf(true, true, ['contract'])).toBe('on_leave');
    expect(employeeStatusOf(true, false, ['contract'])).toBe('pending');
    expect(employeeStatusOf(true, false, ['signed_copy'])).toBe('pending');
    // Visado y certificados salen en el semáforo pero no bloquean el alta
    expect(employeeStatusOf(true, false, ['visa', 'tax_declaration', 'health_safety_cert'])).toBe('active');
    expect(employeeStatusOf(true, false, [])).toBe('active');
  });

  it('buildEmployee: pending without a signed copy, active with it, on_leave when a leave covers today', () => {
    const today = '2026-10-13';
    const unsigned = buildEmployee(person(), [contract], [], today, NOW, { documents: [] });
    expect(unsigned.status).toBe('pending');
    expect(unsigned.missing_items).toContain('signed_copy');

    const ok = buildEmployee(person(), [contract], [], today, NOW, { documents: [signed] });
    expect(ok.status).toBe('active');
    expect(ok.missing_items).toEqual(['visa', 'tax_declaration', 'health_safety_cert']);

    const away = buildEmployee(person(), [contract], [], today, NOW, { documents: [signed], onLeaveToday: new Set(['p1']) });
    expect(away.status).toBe('on_leave');
    expect(buildEmployee(person({ active: false }), [contract], [], today, NOW, { documents: [signed], onLeaveToday: new Set(['p1']) }).status).toBe('terminated');
    // Sin contexto (sin documentos cargados) nadie tiene copia firmada
    expect(buildEmployee(person(), [], [], today, NOW).status).toBe('pending');
  });
});

const doc = (over: Partial<PersonDoc> = {}): PersonDoc => ({
  id: 'd1',
  picker_id: 'p1',
  user_id: null,
  document_type: 'employment_agreement',
  expires_at: null,
  contract_id: 'c1',
  storage_path: 'o1/employment_agreement/d1.pdf',
  ...over,
});

describe('signed copy of the agreement', () => {
  it('must be linked to the contract and cover its end date; the latest one wins', () => {
    const c = { id: 'c1', end_date: '2027-01-01' };
    expect(signedCopyOf(c, [doc({ contract_id: null })])).toBeUndefined();
    expect(signedCopyOf(c, [doc({ document_type: 'passport' })])).toBeUndefined();
    // Copia de la temporada pasada: el contrato se renovó y hace falta el PDF nuevo
    expect(signedCopyOf(c, [doc({ expires_at: '2026-06-30' })])).toBeUndefined();
    expect(signedCopyOf(c, [doc({ expires_at: '2027-01-01' })])?.id).toBe('d1');
    expect(signedCopyOf(c, [doc({ id: 'old', expires_at: '2027-01-01' }), doc({ id: 'new', expires_at: '2028-01-01' })])?.id).toBe('new');
    expect(signedCopyOf(c, [doc({ id: 'open', expires_at: null })])?.id).toBe('open');
    expect(signedCopyOf({ id: 'c1', end_date: null }, [doc({ expires_at: '2026-06-30' })])?.id).toBe('d1');
    expect(signedCopyOf(undefined, [doc()])).toBeUndefined();
  });

  it('pending contracts: drafts, expiring, and active ones without a signed copy', () => {
    const out = pendingContractIds(
      [
        { id: 'draft', status: 'draft', end_date: null },
        { id: 'expiring', status: 'expiring', end_date: '2026-11-01' },
        { id: 'signed', status: 'active', end_date: '2027-01-01' },
        { id: 'unsigned', status: 'active', end_date: '2027-01-01' },
        { id: 'stale', status: 'active', end_date: '2027-01-01' },
        { id: 'terminated', status: 'terminated', end_date: null },
      ],
      [
        doc({ contract_id: 'signed', expires_at: '2027-01-01' }),
        doc({ contract_id: 'stale', expires_at: '2026-01-01' }),
      ]
    );
    expect(out).toEqual(['draft', 'expiring', 'unsigned', 'stale']);
  });
});

describe('weekly payroll entries', () => {
  const emp = (over: Partial<Employee>): Employee => ({
    id: 'p1', full_name: 'A', email: '', role: 'picker', status: 'active', contract_type: 'seasonal',
    contract_start: '', hourly_rate: 23.95, visa_status: 'not_recorded', hire_date: '', ...over,
  });
  const week = { start: '2026-10-05', end: '2026-10-11' };

  it('lists everyone on the books (active, on leave, pending) and anyone who was paid, not terminated people without pay', () => {
    const out = buildPayrollEntries(
      [emp({ id: 'a' }), emp({ id: 'b', status: 'terminated' }), emp({ id: 'c', status: 'terminated' }), emp({ id: 'd', status: 'pending' }), emp({ id: 'e', status: 'on_leave' })],
      [{ id: 'b', hours: 8, buckets: 40, piece: 260, topUp: 0, total: 260 }],
      23.95,
      week
    );
    expect(out.map(e => e.employee_id)).toEqual(['a', 'b', 'd', 'e']);
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
