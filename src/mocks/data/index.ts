/**
 * Mock data — Day 8 harvest, Sunrise Apple Orchard, Cromwell, Central Otago
 * Scenario: Monday 13 April 2026, ~1:30 PM NZST
 * 26 pickers / 2 teams / 3 blocks / Apple harvest
 * Crew 7am start, lunch 12pm, back working — 2.5h left in the day
 */

// ─────────────────────────────────────────────
// IDs FIJOS
// ─────────────────────────────────────────────
export const MOCK_IDS = {
  ORCHARD:      '10000000-0000-0000-0000-000000000001',
  SEASON:       '20000000-0000-0000-0000-000000000001',
  BLOCK_A:      '30000000-0000-0000-0000-000000000001', // Royal Gala
  BLOCK_B:      '30000000-0000-0000-0000-000000000002', // Braeburn
  BLOCK_C:      '30000000-0000-0000-0000-000000000003', // Fuji
  // Aliases de compatibilidad
  BLOCK_1:      '30000000-0000-0000-0000-000000000001',
  BLOCK_2:      '30000000-0000-0000-0000-000000000002',
  USER_MANAGER: '40000000-0000-0000-0000-000000000001',
  USER_TL:      '40000000-0000-0000-0000-000000000002',
  USER_TL_1:    '40000000-0000-0000-0000-000000000002', // James Wilson
  USER_TL_2:    '40000000-0000-0000-0000-000000000003', // Sarah Ngapo
  USER_QC:      '40000000-0000-0000-0000-000000000004', // Carmen Reyes
  USER_HR:      '40000000-0000-0000-0000-000000000005', // Fiona Brett
  USER_PAYROLL: '40000000-0000-0000-0000-000000000006', // Owen Marsh
} as const;

// ─────────────────────────────────────────────
// FECHAS (NZ timezone aware)
// ─────────────────────────────────────────────
const NOW = new Date().toISOString();
const _nzFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' });
const TODAY     = _nzFmt.format(new Date());
const YESTERDAY = _nzFmt.format(new Date(Date.now() - 86_400_000));

// Timestamp en hora local NZ para que scanned_at.substring(0,10) === todayNZST()
function toNZTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: 'Pacific/Auckland' }).replace(' ', 'T') + '+12:00';
}

// Pieza central para payroll — usada en performance view y functions handler
const PIECE_RATE_MOCK = 6.50;

// ─────────────────────────────────────────────
// JWT / AUTH (sin cambios — solo identidad)
// ─────────────────────────────────────────────
export const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiI0MDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjE3MTMwMDAwMDAsImVtYWlsIjoibWFuYWdlckBoYXJ2ZXN0cHJvLm56Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.' +
  'mock_signature';

export const MOCK_AUTH_USER = {
  id: MOCK_IDS.USER_MANAGER,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'manager@harvestpro.nz',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: NOW,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Allan Rodriguez' },
  identities: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: NOW,
};

export const MOCK_SESSION = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'mock-refresh-token-harvestpro',
  user: MOCK_AUTH_USER,
};

// ─────────────────────────────────────────────
// ORCHARD — Cromwell, Central Otago
// ─────────────────────────────────────────────
const mockOrchards = [
  {
    id: MOCK_IDS.ORCHARD,
    code: 'CO-001',
    name: 'Sunrise Apple Orchard',
    location: 'Cromwell, Central Otago, NZ',
    total_blocks: 3,
    total_rows: 60,
    hectares: 52,
    crop_type: 'apple',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    code: 'HB-002',
    name: 'Blue Ridge Cherry Estate',
    location: 'Nelson, Nelson-Tasman, NZ',
    total_blocks: 4,
    total_rows: 80,
    hectares: 62,
    crop_type: 'cherry',
    deleted_at: null,
    created_at: '2026-01-05T00:00:00Z',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    code: 'MBR-003',
    name: 'Marlborough Pear Grove',
    location: 'Blenheim, Marlborough, NZ',
    total_blocks: 2,
    total_rows: 40,
    hectares: 31,
    crop_type: 'pear',
    deleted_at: null,
    created_at: '2026-01-10T00:00:00Z',
  },
];

// ─────────────────────────────────────────────
// SEASON — started April 5, day 8 = April 13
// ─────────────────────────────────────────────
const mockHarvestSeasons = [
  {
    id: MOCK_IDS.SEASON,
    orchard_id: MOCK_IDS.ORCHARD,
    name: 'Autumn Harvest 2026',
    start_date: '2026-04-05',
    end_date: '2026-06-30',
    status: 'active',
    deleted_at: null,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
];

// ─────────────────────────────────────────────
// ORCHARD BLOCKS
// ─────────────────────────────────────────────
const mockOrchardBlocks = [
  {
    id: MOCK_IDS.BLOCK_A,
    orchard_id: MOCK_IDS.ORCHARD,
    season_id: MOCK_IDS.SEASON,
    name: 'Block A — Royal Gala',
    total_rows: 20,
    start_row: 1,
    color_code: '#22c55e',
    status: 'active',
    deleted_at: null,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.BLOCK_B,
    orchard_id: MOCK_IDS.ORCHARD,
    season_id: MOCK_IDS.SEASON,
    name: 'Block B — Braeburn',
    total_rows: 20,
    start_row: 21,
    color_code: '#3b82f6',
    status: 'active',
    deleted_at: null,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.BLOCK_C,
    orchard_id: MOCK_IDS.ORCHARD,
    season_id: MOCK_IDS.SEASON,
    name: 'Block C — Fuji',
    total_rows: 20,
    start_row: 41,
    color_code: '#f59e0b',
    status: 'idle',
    deleted_at: null,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
];

// ─────────────────────────────────────────────
// ROWS — 60 rows (A:1-20, B:21-40, C:41-60)
// target_buckets=20 — realistic for a full apple row at 6.5h
// ─────────────────────────────────────────────
const mockBlockRows = Array.from({ length: 60 }, (_, i) => {
  const blockId = i < 20 ? MOCK_IDS.BLOCK_A : i < 40 ? MOCK_IDS.BLOCK_B : MOCK_IDS.BLOCK_C;
  const variety = i < 20 ? 'Royal Gala' : i < 40 ? 'Braeburn' : 'Fuji';
  return {
    id: `60000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    block_id: blockId,
    row_number: i + 1,
    variety,
    target_buckets: 20,
    deleted_at: null,
    created_at: '2026-04-05T00:00:00Z',
  };
});

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────
const mockUsers = [
  {
    id: MOCK_IDS.USER_MANAGER,
    email: 'manager@harvestpro.nz',
    full_name: 'Allan Rodriguez',
    role: 'manager',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: null,
    is_active: true,
    privacy_consent_at: '2026-01-01T00:00:00Z',
    terms_consent_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_TL_1,
    email: 'james.wilson@harvestpro.nz',
    full_name: 'James Wilson',
    role: 'team_leader',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: 'team-a',
    is_active: true,
    privacy_consent_at: '2026-04-05T00:00:00Z',
    terms_consent_at: '2026-04-05T00:00:00Z',
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_TL_2,
    email: 'sarah.ngapo@harvestpro.nz',
    full_name: 'Sarah Ngapo',
    role: 'team_leader',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: 'team-b',
    is_active: true,
    privacy_consent_at: '2026-04-05T00:00:00Z',
    terms_consent_at: '2026-04-05T00:00:00Z',
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_QC,
    email: 'carmen.reyes@harvestpro.nz',
    full_name: 'Carmen Reyes',
    role: 'qc_inspector',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: null,
    is_active: true,
    privacy_consent_at: '2026-04-05T00:00:00Z',
    terms_consent_at: '2026-04-05T00:00:00Z',
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_HR,
    email: 'fiona.brett@harvestpro.nz',
    full_name: 'Fiona Brett',
    role: 'hr_admin',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: null,
    is_active: true,
    privacy_consent_at: '2026-01-01T00:00:00Z',
    terms_consent_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_PAYROLL,
    email: 'owen.marsh@harvestpro.nz',
    full_name: 'Owen Marsh',
    role: 'payroll_admin',
    orchard_id: MOCK_IDS.ORCHARD,
    team_id: null,
    is_active: true,
    privacy_consent_at: '2026-01-01T00:00:00Z',
    terms_consent_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: NOW,
  },
];

// ─────────────────────────────────────────────
// PICKERS — 26 cosechadores en 2 equipos
// [name, picker_id, buckets_today, current_row, tl_id, status, note, hours_wage_check]
// hours_wage_check=8 sólo para los 3 con wage alerts — resto 0 (no tracked)
//
// Sumas:
//   Team A: 28+24+22+8+18+21+20+17+19+23+16+10+15 = 241
//   Team B: 26+22+20+17+19+16+21+23+18+12+20+25+19 = 258 — pero reducimos -11 para llegar a 489
//   Team B ajustado: Jack 25→22, Ana 19→16, Ioane 16→14 → 258-11=247... 241+247=488, necesito +1
//   Rajan 22→23 → 241+248=489 ✓
// Final: 489 buckets
// ─────────────────────────────────────────────
type PickerDef = [string, string, number, number, string, string, string | null, number];

const PICKER_DEFS: PickerDef[] = [
  // ── Team A — James Wilson (Block A rows 1-14) ───────────────
  // [name,            pid,    bkts, row, tl,                     status,     note,   hrs]
  ['Rawiri Henare',   'P001',  28,   5,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Sione Taufa',     'P002',  24,   6,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Anahera Mahuta',  'P003',  22,   7,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Tom Blackwood',   'P004',   8,  11,  MOCK_IDS.USER_TL_1, 'active',   'slow',  8],  // wage alert
  ['Jade Chen',       'P005',  18,   8,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Manaia Rewi',     'P006',  21,   9,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Pasifika Latu',   'P007',  20,  10,  MOCK_IDS.USER_TL_1, 'on_break', null,    0],
  ['Daniel Murphy',   'P008',  17,  12,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Aroha Patel',     'P009',  19,   2,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Wiremu Tamati',   'P010',  23,   3,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Sitiveni Rabuka', 'P011',  16,  13,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  ['Emily Foster',    'P012',  10,  14,  MOCK_IDS.USER_TL_1, 'active',   'slow',  8],  // wage alert (new)
  ['Tane Raukawa',    'P013',  15,   4,  MOCK_IDS.USER_TL_1, 'active',   null,    0],
  // ── Team B — Sarah Ngapo (Block B rows 21-33) ───────────────
  ['Mele Vunipola',   'P014',  26,  21,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Rajan Sharma',    'P015',  23,  22,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Kalani Tuiono',   'P016',  20,  23,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Maria Santos',    'P017',  17,  26,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Te Koha Waititi', 'P018',  19,  27,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Ioane Faleolo',   'P019',  14,  28,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Sophie Anderson', 'P020',  21,  25,  MOCK_IDS.USER_TL_2, 'on_break', null,    0],
  ['Tevita Moala',    'P021',  23,  29,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Priya Nair',      'P022',  18,  30,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Hone Matene',     'P023',  12,  31,  MOCK_IDS.USER_TL_2, 'active',   'slow',  8],  // wage alert
  ['Leilani Samoa',   'P024',  20,  24,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Jack Williams',   'P025',  22,  32,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  ['Ana Tupou',       'P026',  16,  33,  MOCK_IDS.USER_TL_2, 'active',   null,    0],
  // Total: 241 + 248 = 489 ✓
];

const mockPickers = PICKER_DEFS.map(([name, picker_id, totalBuckets, currentRow, tlId, status, , hours], i) => ({
  id: `50000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
  picker_id,
  name,
  orchard_id: MOCK_IDS.ORCHARD,
  team_leader_id: tlId,
  role: 'picker',
  safety_verified: true,
  total_buckets_today: totalBuckets,
  current_row: currentRow,
  hours,
  status,
  daily_attendance: [{ check_in: `${TODAY}T07:00:00+12:00`, check_out: null }],
  archived_at: null,
  deleted_at: null,
  version: 1,
  created_at: '2026-04-05T00:00:00Z',
  updated_at: NOW,
}));

// Team leaders también en pickers (crew.filter(role==='team_leader') los encuentra)
const mockTeamLeaders = [
  {
    id: MOCK_IDS.USER_TL_1,
    picker_id: 'TL001',
    name: 'James Wilson',
    orchard_id: MOCK_IDS.ORCHARD,
    team_leader_id: null,
    role: 'team_leader',
    safety_verified: true,
    total_buckets_today: 0,
    current_row: 0,
    hours: 0,
    status: 'active',
    daily_attendance: [{ check_in: `${TODAY}T07:00:00+12:00`, check_out: null }],
    archived_at: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: MOCK_IDS.USER_TL_2,
    picker_id: 'TL002',
    name: 'Sarah Ngapo',
    orchard_id: MOCK_IDS.ORCHARD,
    team_leader_id: null,
    role: 'team_leader',
    safety_verified: true,
    total_buckets_today: 0,
    current_row: 0,
    hours: 0,
    status: 'active',
    daily_attendance: [{ check_in: `${TODAY}T07:00:00+12:00`, check_out: null }],
    archived_at: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
];
mockPickers.push(...(mockTeamLeaders as unknown as typeof mockPickers));

// Runners — aparecen en Teams/Logistics
const mockRunners = [
  {
    id: 'r0000000-0000-0000-0000-000000000001',
    picker_id: 'RUN001',
    name: 'Liam Tane',
    orchard_id: MOCK_IDS.ORCHARD,
    team_leader_id: MOCK_IDS.USER_TL_1,
    role: 'runner',
    safety_verified: true,
    total_buckets_today: 0,
    current_row: 5,
    hours: 0,
    status: 'active',
    daily_attendance: [{ check_in: `${TODAY}T07:00:00+12:00`, check_out: null }],
    archived_at: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
  {
    id: 'r0000000-0000-0000-0000-000000000002',
    picker_id: 'RUN002',
    name: 'Hemi Parata',
    orchard_id: MOCK_IDS.ORCHARD,
    team_leader_id: MOCK_IDS.USER_TL_2,
    role: 'runner',
    safety_verified: true,
    total_buckets_today: 0,
    current_row: 25,
    hours: 0,
    status: 'active',
    daily_attendance: [{ check_in: `${TODAY}T07:00:00+12:00`, check_out: null }],
    archived_at: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
];
mockPickers.push(...mockRunners);

const pickerId = (i: number) => mockPickers[i].id;

// ─────────────────────────────────────────────
// BUCKET RECORDS — 489 today, 0 yesterday (rest day)
// Timestamps NZ-aware so filteredBucketRecords (todayNZST()) returns them all
// ─────────────────────────────────────────────

function generateBuckets(
  pickerIdx: number,
  count: number,
  dateStr: string,
  bucketIndexOffset: number,
): Record<string, unknown>[] {
  if (count === 0) return [];
  const pId = pickerId(pickerIdx);
  const tlId = (mockPickers[pickerIdx] as Record<string, unknown>).team_leader_id as string;
  const baseRow = (mockPickers[pickerIdx] as Record<string, unknown>).current_row as number || 1;
  // ~8 buckets per row before advancing to the next
  const rowFor = (i: number) => Math.min(baseRow + Math.floor(i / 8), 60);

  const isToday = dateStr === TODAY;
  const dayStartMs = new Date(`${dateStr}T07:00:00+12:00`).getTime();
  // 1:30pm NZ = 6.5h after 7am, subtract 5min for "still in progress"
  const nowRefMs = isToday ? Date.now() : new Date(`${dateStr}T13:25:00+12:00`).getTime();
  const endMs   = nowRefMs - 5 * 60_000;
  const interval = count > 1 ? (endMs - dayStartMs) / (count - 1) : 0;

  const qualities: ('A' | 'B')[] = ['A', 'A', 'A', 'B', 'A'];

  return Array.from({ length: count }, (_, i) => {
    const scannedAt = toNZTimestamp(dayStartMs + i * interval);
    const rowNum = rowFor(i);
    const rowId = `60000000-0000-0000-0000-${String(rowNum).padStart(12, '0')}`;
    const globalIdx = bucketIndexOffset + i + 1;
    return {
      id: `b${String(pickerIdx + 1).padStart(2, '0')}000000-0000-0000-0000-${String(globalIdx).padStart(12, '0')}`,
      orchard_id: MOCK_IDS.ORCHARD,
      season_id:  MOCK_IDS.SEASON,
      picker_id:  pId,
      bin_id:     null,
      block_row_id: rowId,
      scanned_by: tlId,
      scanned_at: scannedAt,
      row_number: rowNum,
      coords:     null,
      quality_grade: qualities[i % qualities.length],
      deleted_at: null,
      version: 1,
      created_at: scannedAt,
      updated_at: scannedAt,
    };
  });
}

let bucketOffset = 0;
const todayBuckets: Record<string, unknown>[] = [];
PICKER_DEFS.forEach(([, , count], i) => {
  todayBuckets.push(...generateBuckets(i, count, TODAY, bucketOffset));
  bucketOffset += count;
});

// Yesterday = rest day (0 buckets) → no yesterday records needed
// day_closures holds the 7-day history for analytics
const mockBucketRecords = [...todayBuckets];

// ─────────────────────────────────────────────
// DAILY ATTENDANCE — all 26 present today
// ─────────────────────────────────────────────
const mockDailyAttendance = PICKER_DEFS.map(([, , , , , , ,], i) => ({
  id: `80000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
  picker_id:   pickerId(i),
  orchard_id:  MOCK_IDS.ORCHARD,
  season_id:   MOCK_IDS.SEASON,
  date:        TODAY,
  check_in:  `${TODAY}T07:00:00+12:00`,
  check_out: null,
  status:         'present',
  hours_worked: null,
  notes:       null,
  recorded_by: i < 13 ? MOCK_IDS.USER_TL_1 : MOCK_IDS.USER_TL_2,
  correction_reason: null,
  corrected_by: null,
  corrected_at: null,
  deleted_at:  null,
  version: 1,
  created_at:  `${TODAY}T07:05:00+12:00`,
  updated_at:  NOW,
  picker:      mockPickers[i],
}));

// Agregar asistencia de team leaders y runners (no están en PICKER_DEFS)
const makeTLRunnerAttendance = (id: string, recordId: string, recordedBy: string, pickerObj: typeof mockPickers[0]) => ({
  id: recordId,
  picker_id:   id,
  orchard_id:  MOCK_IDS.ORCHARD,
  season_id:   MOCK_IDS.SEASON,
  date:        TODAY,
  check_in:  `${TODAY}T07:00:00+12:00`,
  check_out: null,
  status:         'present',
  hours_worked: null,
  notes:       null,
  recorded_by: recordedBy,
  correction_reason: null,
  corrected_by: null,
  corrected_at: null,
  deleted_at:  null,
  version: 1,
  created_at:  `${TODAY}T07:05:00+12:00`,
  updated_at:  NOW,
  picker:      pickerObj,
});

(mockDailyAttendance as unknown[]).push(
  makeTLRunnerAttendance(MOCK_IDS.USER_TL_1, '80000000-0000-0000-0000-000000000099', MOCK_IDS.USER_TL_1, mockTeamLeaders[0] as unknown as typeof mockPickers[0]),
  makeTLRunnerAttendance(MOCK_IDS.USER_TL_2, '80000000-0000-0000-0000-000000000100', MOCK_IDS.USER_TL_2, mockTeamLeaders[1] as unknown as typeof mockPickers[0]),
  makeTLRunnerAttendance('r0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000101', MOCK_IDS.USER_TL_1, mockRunners[0] as unknown as typeof mockPickers[0]),
  makeTLRunnerAttendance('r0000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000102', MOCK_IDS.USER_TL_2, mockRunners[1] as unknown as typeof mockPickers[0])
);

// ─────────────────────────────────────────────
// ROW ASSIGNMENTS — one per picker
// ─────────────────────────────────────────────
const mockRowAssignments = PICKER_DEFS.map(([, , , currentRow, tlId], i) => ({
  id: `a0000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
  picker_id:       pickerId(i),
  team_leader_id:  tlId,
  orchard_id:      MOCK_IDS.ORCHARD,
  season_id:       MOCK_IDS.SEASON,
  row_number:      currentRow,
  side:            'north',
  assigned_pickers: [pickerId(i)],
  completion_percentage: 0,
  status:      'active',
  date:        TODAY,
  assigned_at: `${TODAY}T07:00:00+12:00`,
  created_at:  `${TODAY}T07:00:00+12:00`,
  updated_at:  NOW,
}));

// ─────────────────────────────────────────────
// QC INSPECTIONS — 5 checks today
// ─────────────────────────────────────────────
const mockQcInspections = [
  {
    id: 'c0000001-0000-0000-0000-000000000001',
    orchard_id:   MOCK_IDS.ORCHARD,
    picker_id:    pickerId(8),   // Aroha Patel, row 2 (done)
    inspector_id: MOCK_IDS.USER_QC,
    quality_grade: 'A',
    notes: 'Excellent technique — fruit size consistent, no bruising. Row 2 export-ready.',
    photo_url: null,
    coords: null,
    created_at: toNZTimestamp(Date.now() - 5.5 * 3600_000),  // ~08:00am
    updated_at: NOW,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000002',
    orchard_id:   MOCK_IDS.ORCHARD,
    picker_id:    pickerId(9),   // Wiremu Tamati, row 3 (done)
    inspector_id: MOCK_IDS.USER_QC,
    quality_grade: 'A',
    notes: 'Good colour and sizing on Royal Gala — recommend for export grade.',
    photo_url: null,
    coords: null,
    created_at: toNZTimestamp(Date.now() - 4 * 3600_000),    // ~09:30am
    updated_at: NOW,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000003',
    orchard_id:   MOCK_IDS.ORCHARD,
    picker_id:    pickerId(3),   // Tom Blackwood — struggling, row 11
    inspector_id: MOCK_IDS.USER_QC,
    quality_grade: 'B',
    notes: 'Some bruising on larger fruit — reviewed picking grip. Pace also below team average.',
    photo_url: null,
    coords: null,
    created_at: toNZTimestamp(Date.now() - 3 * 3600_000),    // ~10:30am
    updated_at: NOW,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000004',
    orchard_id:   MOCK_IDS.ORCHARD,
    picker_id:    pickerId(14),  // Rajan Sharma, row 22 (done)
    inspector_id: MOCK_IDS.USER_QC,
    quality_grade: 'A',
    notes: 'Braeburn Block B looking excellent — good colour, no scarring.',
    photo_url: null,
    coords: null,
    created_at: toNZTimestamp(Date.now() - 2.5 * 3600_000),  // ~11:00am
    updated_at: NOW,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000005',
    orchard_id:   MOCK_IDS.ORCHARD,
    picker_id:    pickerId(22),  // Hone Matene — slow day, row 31
    inspector_id: MOCK_IDS.USER_QC,
    quality_grade: 'B',
    notes: 'Technique acceptable but pace well below average. Check with Sarah re: welfare.',
    photo_url: null,
    coords: null,
    created_at: toNZTimestamp(Date.now() - 1.5 * 3600_000),  // ~12:00pm
    updated_at: NOW,
  },
];

// ─────────────────────────────────────────────
// BINS — schema-aligned status enum: empty/partial/full/collected
// Rows 1-4 (Block A) and rows 21-24 (Block B) are completed
// ─────────────────────────────────────────────
const mockBins = [
  // Block A completed rows (1-4) → 4 full bins
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `bin-full-a${String(i + 1).padStart(4, '0')}`,
    bin_code: `BIN-A${String(101 + i)}`,
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'full',
    variety: 'Royal Gala',
    location: { lat: -45.040 + i * 0.0015, lng: 169.200 + i * 0.0015 },
    movement_history: [],
    filled_at: toNZTimestamp(Date.now() - (5 - i) * 90 * 60_000),
    created_at: `${TODAY}T07:00:00+12:00`,
    updated_at: NOW,
  })),
  // Block B completed rows (21-24) → 3 full bins
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `bin-full-b${String(i + 1).padStart(4, '0')}`,
    bin_code: `BIN-B${String(201 + i)}`,
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'full',
    variety: 'Braeburn',
    location: { lat: -45.055 + i * 0.0015, lng: 169.215 + i * 0.0015 },
    movement_history: [],
    filled_at: toNZTimestamp(Date.now() - (4 - i) * 90 * 60_000),
    created_at: `${TODAY}T07:00:00+12:00`,
    updated_at: NOW,
  })),
  // Collected (already picked up by truck earlier today)
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `bin-coll-${String(i + 1).padStart(4, '0')}`,
    bin_code: `BIN-C${String(301 + i)}`,
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'collected',
    variety: i < 2 ? 'Royal Gala' : 'Braeburn',
    location: { lat: -45.060, lng: 169.225 },
    movement_history: [{ action: 'collected', at: toNZTimestamp(Date.now() - 2 * 3600_000) }],
    filled_at: toNZTimestamp(Date.now() - 3 * 3600_000),
    created_at: `${TODAY}T07:00:00+12:00`,
    updated_at: NOW,
  })),
  // Partial bins — rows 5-10 and 25-26 in progress
  {
    id: 'bin-part-a001',
    bin_code: 'BIN-A201',
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'partial',
    variety: 'Royal Gala',
    location: { lat: -45.042, lng: 169.207 },
    movement_history: [],
    filled_at: null,
    created_at: `${TODAY}T10:00:00+12:00`,
    updated_at: NOW,
  },
  {
    id: 'bin-part-b001',
    bin_code: 'BIN-B201',
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'partial',
    variety: 'Braeburn',
    location: { lat: -45.057, lng: 169.220 },
    movement_history: [],
    filled_at: null,
    created_at: `${TODAY}T10:30:00+12:00`,
    updated_at: NOW,
  },
  // Empty bins staged for afternoon rows
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `bin-empty-${String(i + 1).padStart(4, '0')}`,
    bin_code: `BIN-E${String(401 + i)}`,
    orchard_id: MOCK_IDS.ORCHARD,
    status: 'empty',
    variety: null,
    location: null,
    movement_history: [],
    filled_at: null,
    created_at: `${TODAY}T06:30:00+12:00`,
    updated_at: NOW,
  })),
];

// ─────────────────────────────────────────────
// HARVEST SETTINGS
// ─────────────────────────────────────────────
const mockHarvestSettings = [
  {
    orchard_id: MOCK_IDS.ORCHARD,
    min_wage_rate: 23.95,
    piece_rate: PIECE_RATE_MOCK,   // $6.50/bucket
    min_buckets_per_hour: 4,       // ceil(23.95/6.50) = 4
    target_tons: 160,              // seasonal target
    variety: 'Royal Gala',
    created_at: '2026-04-05T00:00:00Z',
    updated_at: NOW,
  },
];

// ─────────────────────────────────────────────
// DAY SETUP
// ─────────────────────────────────────────────
const mockDaySetups = [
  {
    id: '90000000-0000-0000-0000-000000000001',
    orchard_id: MOCK_IDS.ORCHARD,
    season_id:  MOCK_IDS.SEASON,
    date:       TODAY,
    variety:    'Royal Gala / Braeburn',
    target_tons: 12,
    piece_rate:  PIECE_RATE_MOCK,
    min_wage_rate: 23.95,
    start_time: `${TODAY}T07:00:00+12:00`,
    created_by: MOCK_IDS.USER_MANAGER,
    deleted_at: null,
    created_at: `${TODAY}T06:30:00+12:00`,
  },
];

// ─────────────────────────────────────────────
// DAY CLOSURES — 7-day history
// [daysAgo, buckets, tons, pickers, totalCostNZD]
// Day 7 = season day 1, day 1 = yesterday (rest)
// ─────────────────────────────────────────────
const PAST_CLOSURES = [
  [1, 0,   0.0,   0, 0],     // yesterday — rest day (Sunday)
  [2, 390, 9.75,  24, 585],
  [3, 534, 13.35, 26, 872],
  [4, 487, 12.18, 26, 798],
  [5, 512, 12.80, 26, 843],
  [6, 498, 12.45, 25, 815],
  [7, 425, 10.63, 24, 720],  // season day 1
] as const;

const mockDayClosures = PAST_CLOSURES.map(([daysAgo, buckets, tons, pickers, cost], i) => {
  const date = _nzFmt.format(new Date(Date.now() - daysAgo * 86_400_000));
  return {
    id: `dc000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    orchard_id:  MOCK_IDS.ORCHARD,
    season_id:   MOCK_IDS.SEASON,
    date,
    total_buckets: buckets,
    total_tons:    tons,
    total_pickers: pickers,
    avg_buckets_per_picker: pickers > 0 ? Math.round(buckets / pickers) : 0,
    total_earnings: cost.toFixed(2),
    piece_rate:    PIECE_RATE_MOCK,
    min_wage_rate: 23.95,
    closed_by:    MOCK_IDS.USER_MANAGER,
    closed_at:    daysAgo === 1 ? null : `${date}T17:00:00+12:00`,
    notes:        daysAgo === 1 ? 'Rest day — no harvest operations' : null,
    created_at:   `${date}T17:00:00+12:00`,
    updated_at:   `${date}T17:00:00+12:00`,
  };
});

// ─────────────────────────────────────────────
// BROADCASTS & MESSAGES (English, matching scenario)
// ─────────────────────────────────────────────
const mockBroadcasts = [
  {
    id: 'br000001-0000-0000-0000-000000000001',
    orchard_id: MOCK_IDS.ORCHARD,
    sender_id:  MOCK_IDS.USER_MANAGER,
    title: 'Good morning — Day 8',
    content: '☀️ Good morning team! Day 8 of harvest. Target today: 12 tons. Block A (Royal Gala) and Block B (Braeburn) both active. Block C (Fuji) starts tomorrow. Let\'s have a great one!',
    message: '☀️ Day 8 — Target: 12 tons. Block A + B active. Block C tomorrow.',
    priority: 'normal',
    target_roles: ['team_leader', 'runner', 'picker'],
    acknowledged_by: [],
    sent_at:    toNZTimestamp(Date.now() - 6.5 * 3600_000),
    created_at: toNZTimestamp(Date.now() - 6.5 * 3600_000),
    updated_at: NOW,
  },
  {
    id: 'br000001-0000-0000-0000-000000000002',
    orchard_id: MOCK_IDS.ORCHARD,
    sender_id:  MOCK_IDS.USER_TL_1,
    title: 'Block A R8 finished',
    content: 'Block A Row 8 finished — moving Jade, Manaia, and Pasifika to Rows 9 and 10.',
    message: 'James (Team A): Block A R8 finished, moving pickers to R9 and R10.',
    priority: 'normal',
    target_roles: ['manager'],
    acknowledged_by: [MOCK_IDS.USER_MANAGER],
    sent_at:    toNZTimestamp(Date.now() - 2 * 3600_000),
    created_at: toNZTimestamp(Date.now() - 2 * 3600_000),
    updated_at: NOW,
  },
  {
    id: 'br000001-0000-0000-0000-000000000003',
    orchard_id: MOCK_IDS.ORCHARD,
    sender_id:  MOCK_IDS.USER_TL_2,
    title: 'Block B R22 almost done',
    content: 'Block B Row 22 almost finished — moving Rajan\'s sub-group to R25 after lunch break.',
    message: 'Sarah (Team B): Block B R22 almost done, moving team to R25 after lunch.',
    priority: 'normal',
    target_roles: ['manager'],
    acknowledged_by: [],
    sent_at:    toNZTimestamp(Date.now() - 100 * 60_000),
    created_at: toNZTimestamp(Date.now() - 100 * 60_000),
    updated_at: NOW,
  },
  {
    id: 'br000001-0000-0000-0000-000000000004',
    orchard_id: MOCK_IDS.ORCHARD,
    sender_id:  'r0000000-0000-0000-0000-000000000001',  // Liam Tane
    title: 'Bin Station 1 at 90%',
    content: 'Bin Station 1 Block A approaching capacity — requesting truck pickup ASAP.',
    message: 'Liam Tane: Bin Station 1 at 90%, requesting pickup.',
    priority: 'high',
    target_roles: ['manager', 'logistics'],
    acknowledged_by: [],
    sent_at:    toNZTimestamp(Date.now() - 40 * 60_000),
    created_at: toNZTimestamp(Date.now() - 40 * 60_000),
    updated_at: NOW,
  },
];

const mockConversations = [
  {
    id: 'cv000001-0000-0000-0000-000000000001',
    orchard_id: MOCK_IDS.ORCHARD,
    type: 'direct',
    name: null,
    participant_ids: [MOCK_IDS.USER_MANAGER, MOCK_IDS.USER_TL_1],
    last_message: 'Great pace on Block A — keep it up!',
    last_message_at: toNZTimestamp(Date.now() - 90 * 60_000),
    created_at: toNZTimestamp(Date.now() - 6.5 * 3600_000),
    updated_at: toNZTimestamp(Date.now() - 90 * 60_000),
  },
  {
    id: 'cv000001-0000-0000-0000-000000000002',
    orchard_id: MOCK_IDS.ORCHARD,
    type: 'direct',
    name: null,
    participant_ids: [MOCK_IDS.USER_MANAGER, MOCK_IDS.USER_TL_2],
    last_message: 'Noted — good call on R25. Keep an eye on Hone.',
    last_message_at: toNZTimestamp(Date.now() - 80 * 60_000),
    created_at: toNZTimestamp(Date.now() - 6.5 * 3600_000),
    updated_at: toNZTimestamp(Date.now() - 80 * 60_000),
  },
];

const mockChatMessages = [
  {
    id: 'msg00001-0000-0000-0000-000000000001',
    conversation_id: 'cv000001-0000-0000-0000-000000000001',
    sender_id: MOCK_IDS.USER_TL_1,
    content: 'R8 done. Rawiri\'s group is flying — already halfway through R5.',
    read_by: [MOCK_IDS.USER_MANAGER],
    type: 'text',
    sent_at:    toNZTimestamp(Date.now() - 2 * 3600_000),
    created_at: toNZTimestamp(Date.now() - 2 * 3600_000),
  },
  {
    id: 'msg00001-0000-0000-0000-000000000002',
    conversation_id: 'cv000001-0000-0000-0000-000000000001',
    sender_id: MOCK_IDS.USER_MANAGER,
    content: 'Great pace on Block A — keep it up!',
    read_by: [MOCK_IDS.USER_MANAGER, MOCK_IDS.USER_TL_1],
    type: 'text',
    sent_at:    toNZTimestamp(Date.now() - 90 * 60_000),
    created_at: toNZTimestamp(Date.now() - 90 * 60_000),
  },
  {
    id: 'msg00001-0000-0000-0000-000000000003',
    conversation_id: 'cv000001-0000-0000-0000-000000000002',
    sender_id: MOCK_IDS.USER_TL_2,
    content: 'R22 almost finished. Moving Rajan\'s group to R25 after lunch. Hone is struggling today — might need a welfare check.',
    read_by: [MOCK_IDS.USER_MANAGER],
    type: 'text',
    sent_at:    toNZTimestamp(Date.now() - 100 * 60_000),
    created_at: toNZTimestamp(Date.now() - 100 * 60_000),
  },
  {
    id: 'msg00001-0000-0000-0000-000000000004',
    conversation_id: 'cv000001-0000-0000-0000-000000000002',
    sender_id: MOCK_IDS.USER_MANAGER,
    content: 'Noted — good call on R25. Keep an eye on Hone.',
    read_by: [MOCK_IDS.USER_MANAGER, MOCK_IDS.USER_TL_2],
    type: 'text',
    sent_at:    toNZTimestamp(Date.now() - 80 * 60_000),
    created_at: toNZTimestamp(Date.now() - 80 * 60_000),
  },
];

// ─────────────────────────────────────────────
// PICKERS_PERFORMANCE_TODAY (view for payroll handler)
// ─────────────────────────────────────────────
/** Rendimiento de hoy por picker: lo usan los mocks de calculate-payroll y check-compliance */
export const mockPickersPerformanceToday = mockPickers.slice(0, PICKER_DEFS.length).map((p, i) => {
  const [, , buckets, , , , , hoursWage] = PICKER_DEFS[i];
  // Para payroll use 6.5h por defecto; los 3 con wage issue tienen hours=8 para el wage check
  const hours_worked = hoursWage > 0 ? hoursWage : 6.5;
  return {
    ...p,
    total_buckets_today: buckets,
    hours_worked,
    earnings_today: (buckets * PIECE_RATE_MOCK).toFixed(2),
  };
});

// ─────────────────────────────────────────────
// MOCK DATABASE
// ─────────────────────────────────────────────
export const mockDatabase: Record<string, unknown[]> = {
  orchards:                  mockOrchards,
  harvest_seasons:           mockHarvestSeasons,
  orchard_blocks:            mockOrchardBlocks,
  block_rows:                mockBlockRows,
  users:                     mockUsers,
  pickers:                   mockPickers,
  bucket_records:            mockBucketRecords,
  daily_attendance:          mockDailyAttendance,
  row_assignments:           mockRowAssignments,
  qc_inspections:            mockQcInspections,
  bins:                      mockBins,
  harvest_settings:          mockHarvestSettings,
  day_setups:                mockDaySetups,
  day_closures:              mockDayClosures,
  broadcasts:                mockBroadcasts,
  conversations:             mockConversations,
  chat_messages:             mockChatMessages,
  // Tablas vacías (features sin mocks en este sprint)
  allowed_registrations:     [],
  fleet_vehicles:            [],
  transport_requests:        [],
  contracts:                 [],
  bucket_events:             [],
  scanned_stickers:          [],
  push_subscriptions:        [],
  audit_logs:                [],
};

// Suppress unused import warning for YESTERDAY (used indirectly via _nzFmt)
void YESTERDAY;
