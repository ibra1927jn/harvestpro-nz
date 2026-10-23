/**
 * Supabase falso (en memoria) con lo justo para ejecutar computePayroll de la
 * Edge Function en Vitest: from().select().is().eq().in().gte().lte().lt().gt()
 * .order().range(), rpc('piece_rates_as_of') y await. Los filtros comparan fechas/timestamps como
 * instantes (igual que Postgres), no como texto.
 */
type Row = Record<string, unknown>;

function cmpValue(v: unknown): number | string {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return Date.parse(v);
    if (typeof v === 'number') return v;
    return String(v);
}

class Query implements PromiseLike<{ data: Row[]; error: null }> {
    private filters: Array<(r: Row) => boolean> = [];
    private from = 0;
    private to = Infinity;
    constructor(private rows: Row[], private columns: string[] | null) {}

    select(cols?: string): this {
        this.columns = cols && cols !== '*' ? cols.split(',').map(c => c.trim()) : null;
        return this;
    }
    is(col: string, v: null): this { this.filters.push(r => (r[col] ?? null) === v); return this; }
    eq(col: string, v: unknown): this { this.filters.push(r => r[col] === v); return this; }
    in(col: string, vs: unknown[]): this { this.filters.push(r => vs.includes(r[col])); return this; }
    gte(col: string, v: unknown): this { this.filters.push(r => r[col] != null && cmpValue(r[col]) >= cmpValue(v)); return this; }
    lte(col: string, v: unknown): this { this.filters.push(r => r[col] != null && cmpValue(r[col]) <= cmpValue(v)); return this; }
    lt(col: string, v: unknown): this { this.filters.push(r => r[col] != null && cmpValue(r[col]) < cmpValue(v)); return this; }
    gt(col: string, v: unknown): this { this.filters.push(r => r[col] != null && cmpValue(r[col]) > cmpValue(v)); return this; }
    order(): this { return this; }
    range(from: number, to: number): this { this.from = from; this.to = to; return this; }

    private result(): Row[] {
        const out = this.rows.filter(r => this.filters.every(f => f(r))).slice(this.from, this.to + 1);
        const cols = this.columns;
        return cols ? out.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? null]))) : out;
    }

    then<A = { data: Row[]; error: null }, B = never>(
        ok?: ((v: { data: Row[]; error: null }) => A | PromiseLike<A>) | null,
        fail?: ((e: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
        return Promise.resolve({ data: this.result(), error: null as null }).then(ok, fail);
    }
}

/** piece_rates_as_of(p_date): por (huerto, variedad) la fila con la mayor effective_date <= p_date */
function pieceRatesAsOf(rows: Row[], date: string, orchardIds: string[] | null): Row[] {
    const best = new Map<string, Row>();
    for (const r of rows) {
        const d = String(r.effective_date);
        if (d > date || (orchardIds && !orchardIds.includes(String(r.orchard_id)))) continue;
        const k = `${String(r.orchard_id)}|${String(r.variety ?? '').trim().toLowerCase()}`;
        const cur = best.get(k);
        if (!cur || String(cur.effective_date) < d) best.set(k, r);
    }
    return [...best.values()];
}

export function fakeSupabase(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            return new Query(tables[table] ?? [], null);
        },
        async rpc(name: string, args: Record<string, unknown>) {
            if (name !== 'piece_rates_as_of') return { data: null, error: { message: `unknown rpc ${name}` } };
            return { data: pieceRatesAsOf(tables.piece_rates ?? [], String(args.p_date), (args.p_orchard_ids as string[] | null | undefined) ?? null), error: null };
        },
    };
}
