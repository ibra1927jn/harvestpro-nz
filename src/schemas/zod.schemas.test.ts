/**
 * zod.schemas.test.ts — Tests para boundary validation schemas
 *
 * Verifica que los schemas rechacen datos inválidos y acepten datos válidos,
 * y que las utilidades safeParse/safeParseArray funcionen correctamente.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    QRPayloadSchema,
    PickerSchema,
    AttendanceRecordSchema,
    HarvestSettingsSchema,
    QcCriteriaSchema,
    QcInspectionInsertSchema,
    LeaveRequestSchema,
    NewLeaveRequestSchema,
    LEAVE_TYPES,
    LEAVE_STATUSES,
    safeParse,
    safeParseArray,
} from './zod.schemas';

// ─── QRPayloadSchema ────────────────────────────────────────────────────────

describe('QRPayloadSchema', () => {
    const validPayload = { picker_id: 'picker-abc-123' };

    it('acepta un payload mínimo válido', () => {
        const result = QRPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('aplica default "A" a quality_grade si no se provee', () => {
        const result = QRPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.quality_grade).toBe('A');
    });

    it('acepta todos los quality_grade válidos', () => {
        for (const grade of ['A', 'B', 'C', 'reject'] as const) {
            const result = QRPayloadSchema.safeParse({ ...validPayload, quality_grade: grade });
            expect(result.success).toBe(true);
        }
    });

    it('rechaza quality_grade fuera del enum', () => {
        const result = QRPayloadSchema.safeParse({ ...validPayload, quality_grade: 'D' });
        expect(result.success).toBe(false);
    });

    it('rechaza picker_id vacío', () => {
        const result = QRPayloadSchema.safeParse({ picker_id: '' });
        expect(result.success).toBe(false);
    });

    it('rechaza picker_id mayor de 100 caracteres', () => {
        const result = QRPayloadSchema.safeParse({ picker_id: 'x'.repeat(101) });
        expect(result.success).toBe(false);
    });

    it('rechaza orchard_id que no es UUID', () => {
        const result = QRPayloadSchema.safeParse({ ...validPayload, orchard_id: 'no-es-uuid' });
        expect(result.success).toBe(false);
    });

    it('acepta orchard_id UUID válido', () => {
        const result = QRPayloadSchema.safeParse({
            ...validPayload,
            orchard_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
    });

    it('acepta row_number en rango válido', () => {
        const result = QRPayloadSchema.safeParse({ ...validPayload, row_number: 42 });
        expect(result.success).toBe(true);
    });

    it('rechaza row_number negativo', () => {
        const result = QRPayloadSchema.safeParse({ ...validPayload, row_number: -1 });
        expect(result.success).toBe(false);
    });

    it('rechaza row_number mayor de 9999', () => {
        const result = QRPayloadSchema.safeParse({ ...validPayload, row_number: 10000 });
        expect(result.success).toBe(false);
    });

    it('rechaza payload sin picker_id', () => {
        const result = QRPayloadSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// ─── PickerSchema ───────────────────────────────────────────────────────────

describe('PickerSchema', () => {
    const validPicker = {
        id: 'picker-uuid-001',
        name: 'Ana García',
    };

    it('acepta un picker mínimo válido', () => {
        const result = PickerSchema.safeParse(validPicker);
        expect(result.success).toBe(true);
    });

    it('aplica defaults: status="inactive", safety_verified=false, current_row=0', () => {
        const result = PickerSchema.safeParse(validPicker);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.status).toBe('inactive');
            expect(result.data.safety_verified).toBe(false);
            expect(result.data.current_row).toBe(0);
            expect(result.data.picker_id).toBe('');
        }
    });

    it('acepta todos los status válidos', () => {
        const statuses = ['active', 'break', 'on_break', 'issue', 'inactive', 'suspended', 'archived'] as const;
        for (const status of statuses) {
            const result = PickerSchema.safeParse({ ...validPicker, status });
            expect(result.success).toBe(true);
        }
    });

    it('rechaza status fuera del enum', () => {
        const result = PickerSchema.safeParse({ ...validPicker, status: 'deleted' });
        expect(result.success).toBe(false);
    });

    it('rechaza id vacío', () => {
        const result = PickerSchema.safeParse({ ...validPicker, id: '' });
        expect(result.success).toBe(false);
    });

    it('rechaza name vacío', () => {
        const result = PickerSchema.safeParse({ ...validPicker, name: '' });
        expect(result.success).toBe(false);
    });

    it('acepta campos nullable opcionales como null', () => {
        const result = PickerSchema.safeParse({
            ...validPicker,
            orchard_id: null,
            team_leader_id: null,
            archived_at: null,
        });
        expect(result.success).toBe(true);
    });
});

// ─── AttendanceRecordSchema ──────────────────────────────────────────────────

describe('AttendanceRecordSchema', () => {
    const validRecord = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        picker_id: '550e8400-e29b-41d4-a716-446655440002',
        orchard_id: '550e8400-e29b-41d4-a716-446655440003',
        date: '2026-04-10',
    };

    it('acepta un registro mínimo válido', () => {
        const result = AttendanceRecordSchema.safeParse(validRecord);
        expect(result.success).toBe(true);
    });

    it('aplica default status="present"', () => {
        const result = AttendanceRecordSchema.safeParse(validRecord);
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.status).toBe('present');
    });

    it('acepta todos los status de attendance válidos', () => {
        const statuses = ['present', 'absent', 'late', 'sick', 'left_early'] as const;
        for (const status of statuses) {
            const result = AttendanceRecordSchema.safeParse({ ...validRecord, status });
            expect(result.success).toBe(true);
        }
    });

    it('rechaza status fuera del enum', () => {
        const result = AttendanceRecordSchema.safeParse({ ...validRecord, status: 'vacation' });
        expect(result.success).toBe(false);
    });

    it('rechaza fecha con formato incorrecto', () => {
        const badDates = ['10-04-2026', '2026/04/10', 'April 10', ''];
        for (const date of badDates) {
            const result = AttendanceRecordSchema.safeParse({ ...validRecord, date });
            expect(result.success).toBe(false);
        }
    });

    it('acepta fecha en formato YYYY-MM-DD', () => {
        const result = AttendanceRecordSchema.safeParse({ ...validRecord, date: '2026-12-31' });
        expect(result.success).toBe(true);
    });

    it('rechaza id que no es UUID', () => {
        const result = AttendanceRecordSchema.safeParse({ ...validRecord, id: 'not-a-uuid' });
        expect(result.success).toBe(false);
    });

    it('acepta check_in y check_out como null', () => {
        const result = AttendanceRecordSchema.safeParse({
            ...validRecord,
            check_in: null,
            check_out: null,
        });
        expect(result.success).toBe(true);
    });
});

// ─── HarvestSettingsSchema ──────────────────────────────────────────────────

describe('HarvestSettingsSchema', () => {
    const validSettings = {
        min_wage_rate: 23.95,
        piece_rate: 6.5,
        min_buckets_per_hour: 3,
        target_tons: 10,
    };

    it('acepta settings válidos', () => {
        const result = HarvestSettingsSchema.safeParse(validSettings);
        expect(result.success).toBe(true);
    });

    it('rechaza min_wage_rate negativo', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, min_wage_rate: -1 });
        expect(result.success).toBe(false);
    });

    it('rechaza min_wage_rate mayor de 500', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, min_wage_rate: 501 });
        expect(result.success).toBe(false);
    });

    it('rechaza piece_rate negativo', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, piece_rate: -0.1 });
        expect(result.success).toBe(false);
    });

    it('rechaza piece_rate mayor de 100', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, piece_rate: 100.01 });
        expect(result.success).toBe(false);
    });

    it('rechaza min_buckets_per_hour no entero', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, min_buckets_per_hour: 3.5 });
        expect(result.success).toBe(false);
    });

    it('rechaza target_tons negativo', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, target_tons: -1 });
        expect(result.success).toBe(false);
    });

    it('acepta variety como campo opcional', () => {
        const result = HarvestSettingsSchema.safeParse({ ...validSettings, variety: 'Hayward' });
        expect(result.success).toBe(true);
    });
});

// ─── safeParse ──────────────────────────────────────────────────────────────

describe('safeParse', () => {
    it('devuelve {success:true, data} con input válido', () => {
        const result = safeParse(QRPayloadSchema, { picker_id: 'abc' });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.picker_id).toBe('abc');
    });

    it('devuelve {success:false, error} con input inválido', () => {
        const result = safeParse(QRPayloadSchema, { picker_id: '' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('picker_id');
            expect(typeof result.error).toBe('string');
            expect(result.error.length).toBeGreaterThan(0);
        }
    });

    it('formatea múltiples errores de validación en un string legible', () => {
        const result = safeParse(HarvestSettingsSchema, {
            min_wage_rate: -1,
            piece_rate: -1,
            min_buckets_per_hour: 0,
            target_tons: 0,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            // Debe incluir ambos campos con error
            expect(result.error).toContain('min_wage_rate');
            expect(result.error).toContain('piece_rate');
        }
    });

    it('error incluye el path del campo fallido', () => {
        const result = safeParse(AttendanceRecordSchema, {
            id: 'not-uuid',
            picker_id: '550e8400-e29b-41d4-a716-446655440002',
            orchard_id: '550e8400-e29b-41d4-a716-446655440003',
            date: '2026-04-10',
        });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain('id');
    });
});

// ─── safeParseArray ─────────────────────────────────────────────────────────

describe('safeParseArray', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    it('devuelve solo los elementos válidos del array', () => {
        const input = [
            { picker_id: 'valid-001' },
            { picker_id: '' },            // inválido — vacío
            { picker_id: 'valid-002' },
            { picker_id: 'x'.repeat(200) }, // inválido — muy largo
        ];
        const result = safeParseArray(QRPayloadSchema, input);
        expect(result).toHaveLength(2);
        expect(result[0].picker_id).toBe('valid-001');
        expect(result[1].picker_id).toBe('valid-002');
    });

    it('devuelve array vacío si todos los elementos son inválidos', () => {
        const result = safeParseArray(QRPayloadSchema, [{ picker_id: '' }, {}]);
        expect(result).toHaveLength(0);
    });

    it('devuelve todos los elementos si todos son válidos', () => {
        const input = [
            { picker_id: 'a' },
            { picker_id: 'b' },
            { picker_id: 'c' },
        ];
        const result = safeParseArray(QRPayloadSchema, input);
        expect(result).toHaveLength(3);
    });

    it('devuelve array vacío con input vacío', () => {
        const result = safeParseArray(QRPayloadSchema, []);
        expect(result).toHaveLength(0);
    });

    it('emite console.warn por cada elemento inválido', () => {
        consoleWarnSpy.mockClear();
        safeParseArray(QRPayloadSchema, [{ picker_id: '' }, { picker_id: 'valid' }]);
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
});

// ── Mensajes y limites exactos en la frontera ──────────────────────────────

describe('boundary schemas — exact messages and anchors', () => {
    const uuid = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';

    it('QR errors say which field failed and why', () => {
        expect(safeParse(QRPayloadSchema, { picker_id: '' })).toEqual({ success: false, error: 'picker_id: Picker ID cannot be empty' });
        expect(safeParse(QRPayloadSchema, { picker_id: 'x'.repeat(101), orchard_id: 'nope' })).toEqual({
            success: false, error: 'picker_id: Picker ID too long — likely a scan error; orchard_id: Invalid orchard ID format',
        });
    });

    it('picker id and name messages', () => {
        expect(safeParse(PickerSchema, { id: '', name: '' })).toEqual({ success: false, error: 'id: Picker ID required; name: Picker name required' });
    });

    it('attendance date must be exactly YYYY-MM-DD (no prefix, no time)', () => {
        const base = { id: uuid, picker_id: uuid, orchard_id: uuid };
        expect(AttendanceRecordSchema.safeParse({ ...base, date: '2026-10-05' }).success).toBe(true);
        expect(safeParse(AttendanceRecordSchema, { ...base, date: 'x2026-10-05' })).toEqual({ success: false, error: 'date: Date must be YYYY-MM-DD' });
        expect(AttendanceRecordSchema.safeParse({ ...base, date: '2026-10-05T00:00' }).success).toBe(false);
    });

    it('settings: negative or absurd rates are rejected with a clear message; limits are inclusive', () => {
        const ok = { min_wage_rate: 23.95, piece_rate: 6.5, min_buckets_per_hour: 4, target_tons: 10 };
        expect(safeParse(HarvestSettingsSchema, { ...ok, min_wage_rate: -1 })).toEqual({ success: false, error: 'min_wage_rate: Wage rate cannot be negative' });
        expect(safeParse(HarvestSettingsSchema, { ...ok, min_wage_rate: 500.01 })).toEqual({ success: false, error: 'min_wage_rate: Wage rate seems unreasonably high' });
        expect(safeParse(HarvestSettingsSchema, { ...ok, piece_rate: -0.01 })).toEqual({ success: false, error: 'piece_rate: Piece rate cannot be negative' });
        expect(safeParse(HarvestSettingsSchema, { ...ok, piece_rate: 100.5 })).toEqual({ success: false, error: 'piece_rate: Piece rate seems unreasonably high' });
        expect(HarvestSettingsSchema.safeParse({ ...ok, min_wage_rate: 500, piece_rate: 100, min_buckets_per_hour: 200, target_tons: 10000 }).success).toBe(true);
        expect(HarvestSettingsSchema.safeParse({ ...ok, min_buckets_per_hour: 3.5 }).success).toBe(false);
    });
});

// ─── QcInspectionInsertSchema ───────────────────────────────────────────────

describe('QcInspectionInsertSchema', () => {
    const base = { orchard_id: 'o1', picker_id: 'p1', inspector_id: 'u1', grade: 'B' as const };

    it('accepts an inspection with only a grade (previous format)', () => {
        expect(QcInspectionInsertSchema.safeParse(base).success).toBe(true);
        expect(QcInspectionInsertSchema.safeParse({ ...base, notes: null, photo_url: null, criteria: null, score: null, row_number: null, informed: null, comfortable: null, wellbeing_notes: null }).success).toBe(true);
    });

    it('accepts partial criteria and the wellbeing answers', () => {
        const r = QcInspectionInsertSchema.safeParse({
            ...base,
            criteria: { ladder: 'ok', size: 'warn' },
            score: 75,
            row_number: 3,
            informed: false,
            comfortable: true,
            wellbeing_notes: 'short comment',
        });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.criteria).toEqual({ ladder: 'ok', size: 'warn' });
    });

    it('rejects unknown grades, criterion states, out-of-range score and row', () => {
        expect(QcInspectionInsertSchema.safeParse({ ...base, grade: 'D' }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, criteria: { ladder: 'fine' } }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, score: 101 }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, score: -1 }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, score: 50.5 }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, row_number: -1 }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, informed: 'yes' }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, wellbeing_notes: 'x'.repeat(501) }).success).toBe(false);
        expect(QcInspectionInsertSchema.safeParse({ ...base, picker_id: '' }).success).toBe(false);
    });

    it('QcCriteriaSchema drops nothing it knows and ignores unknown keys', () => {
        const r = QcCriteriaSchema.safeParse({ ladder: 'bad', bogus: 'ok' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ ladder: 'bad' });
    });
});

// ─── Leave requests (RRHH: ausencias y permisos) ────────────────────────────

describe('leave request schemas', () => {
    const U1 = '11111111-1111-4111-8111-111111111111';
    const U2 = '22222222-2222-4222-8222-222222222222';
    const base = { orchard_id: U1, picker_id: U2, type: 'annual', start_date: '2026-10-20', end_date: '2026-10-22' };

    it('domains match the DB check constraints', () => {
        expect(LEAVE_TYPES).toEqual(['annual', 'sick', 'bereavement', 'family_violence', 'unpaid', 'day_off', 'other']);
        expect(LEAVE_STATUSES).toEqual(['requested', 'approved', 'rejected', 'cancelled']);
    });

    it('NewLeaveRequestSchema: defaults and trimming', () => {
        const r = NewLeaveRequestSchema.safeParse({ ...base, reason: '  late flight  ' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toEqual({ ...base, half_day: false, reason: 'late flight', requested_by: null, status: 'requested' });
    });

    it('NewLeaveRequestSchema: end before start, half day over several days, bad dates and ids', () => {
        expect(safeParse(NewLeaveRequestSchema, { ...base, end_date: '2026-10-19' })).toEqual({ success: false, error: 'end_date: End date must be on or after the start date' });
        expect(safeParse(NewLeaveRequestSchema, { ...base, half_day: true })).toEqual({ success: false, error: 'half_day: A half day is a single day' });
        expect(NewLeaveRequestSchema.safeParse({ ...base, half_day: true, end_date: '2026-10-20' }).success).toBe(true);
        expect(NewLeaveRequestSchema.safeParse({ ...base, start_date: '20/10/2026' }).success).toBe(false);
        expect(NewLeaveRequestSchema.safeParse({ ...base, picker_id: 'p1' }).success).toBe(false);
        expect(NewLeaveRequestSchema.safeParse({ ...base, type: 'holiday' }).success).toBe(false);
        expect(NewLeaveRequestSchema.safeParse({ ...base, reason: 'x'.repeat(501) }).success).toBe(false);
    });

    it('LeaveRequestSchema: a DB row parses, null defaults fill in, bad status fails', () => {
        const row = { id: U1, ...base, status: 'approved', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' };
        const r = LeaveRequestSchema.safeParse(row);
        expect(r.success).toBe(true);
        if (r.success) expect(r.data).toMatchObject({ half_day: false, reason: null, requested_by: null, decided_by: null, decided_at: null, decision_note: null });
        expect(LeaveRequestSchema.safeParse({ ...row, status: 'pending' }).success).toBe(false);
        expect(safeParseArray(LeaveRequestSchema, [row, { id: 'nope' }])).toHaveLength(1);
    });
});
