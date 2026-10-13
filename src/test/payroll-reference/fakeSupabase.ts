/**
 * Supabase falso (en memoria) con lo justo para ejecutar computePayroll de la
 * Edge Function en Vitest: from().select().is().eq().in().gte().lte().lt()
 * .order().range() y await. Los filtros comparan fechas/timestamps como
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

export function fakeSupabase(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            return new Query(tables[table] ?? [], null);
        },
    };
}
