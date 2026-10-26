import { describe, it, expect } from 'vitest';
import { scrubText, scrubValue, scrubProperties, REDACTED } from './piiScrub';

describe('scrubText', () => {
  it('quita emails', () => {
    expect(scrubText('user ana.p+x@farm.co.nz failed')).toBe('user [redacted-email] failed');
  });

  it('quita IRD de 8 y 9 cifras, con o sin separadores', () => {
    for (const ird of ['123-456-789', '123456789', '123 456 789', '12-345-678', '12345678']) {
      expect(scrubText(`IRD ${ird}.`)).toBe('IRD [redacted-ird].');
    }
  });

  it('quita cuentas bancarias NZ', () => {
    expect(scrubText('acct 12-3456-7890123-00')).toBe('acct [redacted-bank]');
    expect(scrubText('acct 01 0001 0000001 000')).toBe('acct [redacted-bank]');
  });

  it('no rompe UUIDs, ficheros con hash ni números cortos', () => {
    const uuid = '12345678-1234-4abc-8def-123456789012';
    expect(scrubText(`row ${uuid}`)).toBe(`row ${uuid}`);
    expect(scrubText('at index-12345678.js:10')).toBe('at index-12345678.js:10');
    expect(scrubText('bucket 42 in row 7')).toBe('bucket 42 in row 7');
  });
});

describe('scrubValue / scrubProperties', () => {
  it('tapa claves personales en profundidad sin mutar la entrada', () => {
    const input = { a: { email: 'x@y.nz', list: [{ ird_number: '1', ok: 'b@c.nz' }] } };
    const out = scrubValue(input);
    expect(out).toEqual({
      a: { email: REDACTED, list: [{ ird_number: REDACTED, ok: '[redacted-email]' }] },
    });
    expect(input.a.email).toBe('x@y.nz');
  });

  it('scrubProperties quita las claves personales del evento', () => {
    expect(scrubProperties({ picker_id: 'p1', Email: 'x@y.nz', role: 'runner', name: 'LCP' })).toEqual(
      { role: 'runner', name: 'LCP' }
    );
    expect(scrubProperties(undefined)).toBeUndefined();
  });
});
