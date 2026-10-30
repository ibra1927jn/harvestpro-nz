import { http, HttpResponse } from 'msw';
import { mockDatabase } from '../data';

/**
 * Aplica filtros eq de la URL a los datos mock.
 * Supabase envía: ?id=eq.{uuid}&orchard_id=eq.{uuid}
 */
function applyFilters(data: unknown[], url: URL): unknown[] {
  let result = data;
  url.searchParams.forEach((value, key) => {
    if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') return;
    // Ignorar filtros de join PostgREST (ej: daily_attendance.date) — el mock no puede resolverlos
    if (key.includes('.')) return;
    if (value.startsWith('eq.')) {
      const filterValue = value.slice(3);
      result = result.filter(row => {
        const r = row as Record<string, unknown>;
        return String(r[key]) === filterValue;
      });
    }
  });
  return result;
}

// Detecta si la query usa .single() — ese header pide objeto en vez de array
function isSingleQuery(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').includes('pgrst.object');
}

// Handlers para RPC — deben ir ANTES del handler genérico de tablas
export const rpcHandlers = [
  http.post('*/rest/v1/rpc/health_check', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: { connected: true },
    });
  }),

  http.post('*/rest/v1/rpc/close_payroll_period', () => {
    return HttpResponse.json({
      status: 'closed',
      total_buckets: 489,
      total_hours: 173.5,   // 3 pickers×8h + 23 pickers×6.5h
      total_earnings: 4182.00,
      picker_count: 26,
      closed_at: new Date().toISOString(),
    });
  }),

  // Catchall RPC — cualquier función no listada arriba
  http.post('*/rest/v1/rpc/*', () => {
    return HttpResponse.json({ success: true });
  }),
];

// Handlers para tablas de la DB (CRUD genérico)
export const databaseHandlers = [
  // SELECT
  http.get('*/rest/v1/:table', ({ params, request }) => {
    const table = params.table as string;
    const url = new URL(request.url);
    const allData = mockDatabase[table] ?? [];
    const filtered = applyFilters(allData, url);

    // .single() o .maybeSingle() con Accept: pgrst.object → objeto único
    if (isSingleQuery(request)) {
      return HttpResponse.json(filtered[0] ?? null);
    }

    // .maybeSingle() sin header especial → array, el SDK toma data[0] si length===1
    // Para evitar el error "multiple rows", devolvemos solo los filtrados
    return HttpResponse.json(filtered);
  }),

  // INSERT — devuelve el registro creado
  http.post('*/rest/v1/:table', async ({ params, request }) => {
    const table = params.table as string;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const created = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...body,
    };

    // Agregar al mock en memoria para esta sesión
    const list = mockDatabase[table];
    if (list) list.unshift(created);

    const prefer = request.headers.get('Prefer') ?? '';
    if (prefer.includes('return=minimal')) {
      return new HttpResponse(null, { status: 201 });
    }

    return HttpResponse.json(created, { status: 201 });
  }),

  // UPDATE
  http.patch('*/rest/v1/:table', async ({ request }) => {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return HttpResponse.json({
      ...body,
      updated_at: new Date().toISOString(),
    });
  }),

  // DELETE
  http.delete('*/rest/v1/:table', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
