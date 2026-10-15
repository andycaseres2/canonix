import { FOREIGN_KEYS, MockDb, MockError, Policies, type Row, type TableName } from './db';

/** Subset of the PostgREST query builder that the app uses, evaluated against MockDb. */

type Field =
  | { kind: 'all' }
  | { kind: 'col'; name: string }
  | { kind: 'count' }
  | { kind: 'rel'; alias: string; rel: string; fields: Field[] };

export type Result = { data: any; error: { message: string } | null; count: number | null; status: number };

function splitTopLevel(s: string) {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSelect(s: string): Field[] {
  return splitTopLevel(s).map((item): Field => {
    if (item === '*') return { kind: 'all' };
    if (item === 'count') return { kind: 'count' };
    const m = item.match(/^(?:(\w+):)?(\w+)\((.*)\)$/s);
    if (m) return { kind: 'rel', alias: m[1] ?? m[2], rel: m[2], fields: parseSelect(m[3]) };
    return { kind: 'col', name: item };
  });
}

function embed(db: MockDb, rls: Policies, table: TableName, row: Row, f: Extract<Field, { kind: 'rel' }>): unknown {
  const forward = FOREIGN_KEYS.find((k) => k.table === table && k.ref !== 'users' && (k.column === f.rel || k.ref === f.rel));
  if (forward) {
    const target = rls.visible(forward.ref as TableName).find((r) => r.id === row[forward.column]);
    return target ? project(db, rls, forward.ref as TableName, target, f.fields) : null;
  }
  const reverse = FOREIGN_KEYS.find((k) => k.table === f.rel && k.ref === table);
  if (reverse) {
    const rows = rls.visible(reverse.table).filter((r) => r[reverse.column] === row.id);
    if (f.fields.length === 1 && f.fields[0].kind === 'count') return [{ count: rows.length }];
    return rows.map((r) => project(db, rls, reverse.table, r, f.fields));
  }
  throw new MockError(`Could not find a relationship between '${table}' and '${f.rel}'`);
}

function project(db: MockDb, rls: Policies, table: TableName, row: Row, fields: Field[]): Row {
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'all') Object.assign(out, row);
    else if (f.kind === 'col') out[f.name] = row[f.name];
    else if (f.kind === 'rel') out[f.alias] = embed(db, rls, table, row, f);
  }
  return out;
}

/** Postgres ordering: ASC puts nulls last, DESC puts them first. */
function compare(a: unknown, b: unknown, asc: boolean) {
  if (a === b) return 0;
  if (a === null || a === undefined) return asc ? 1 : -1;
  if (b === null || b === undefined) return asc ? -1 : 1;
  const r = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'es') : a < b ? -1 : 1;
  return asc ? r : -r;
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

export class Query implements PromiseLike<Result> {
  private op: Op = 'select';
  private columns: string | null = null;
  private wantCount = false;
  private head = false;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from_: number | null = null;
  private to_: number | null = null;
  private max: number | null = null;
  private one: 'single' | 'maybe' | null = null;
  private payload: Row | Row[] = [];
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(private db: MockDb, private table: TableName, private rls: Policies) {}

  select(columns = '*', opts: { count?: 'exact'; head?: boolean } = {}) {
    this.columns = columns;
    this.wantCount = !!opts.count;
    this.head = !!opts.head;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert'; this.payload = rows; this.upsertOpts = opts; return this;
  }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(col: string, value: unknown) { this.filters.push((r) => r[col] === value); return this; }
  in(col: string, values: unknown[]) { const set = new Set(values); this.filters.push((r) => set.has(r[col])); return this; }
  gte(col: string, value: any) { this.filters.push((r) => r[col] !== null && r[col] >= value); return this; }
  order(col: string, opts: { ascending?: boolean } = {}) { this.orders.push({ col, asc: opts.ascending ?? true }); return this; }
  limit(n: number) { this.max = n; return this; }
  range(from: number, to: number) { this.from_ = from; this.to_ = to; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }

  private run(): Result {
    try {
      const rows = this.execute();
      let data: any = this.columns === null ? null : rows.map((r) => project(this.db, this.rls, this.table, r, parseSelect(this.columns!)));
      const count = this.wantCount ? rows.length : null;
      if (this.head) data = null;
      if (this.one && data) {
        if (data.length > 1 || (this.one === 'single' && data.length === 0)) {
          throw new MockError('JSON object requested, multiple (or no) rows returned');
        }
        data = data[0] ?? null;
      }
      return { data, error: null, count, status: 200 };
    } catch (e) {
      if (!(e instanceof MockError)) throw e;
      return { data: null, error: { message: e.message }, count: null, status: 400 };
    }
  }

  private matching() {
    return this.rls.visible(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private execute(): Row[] {
    const t = this.db.tables;
    switch (this.op) {
      case 'select': {
        const rows = this.matching();
        for (const o of [...this.orders].reverse()) rows.sort((a, b) => compare(a[o.col], b[o.col], o.asc));
        if (this.wantCount && this.head) return rows;
        const start = this.from_ ?? 0;
        const end = this.to_ !== null ? this.to_ + 1 : this.max !== null ? start + this.max : undefined;
        return rows.slice(start, end).slice(0, this.max ?? undefined);
      }
      case 'insert': {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => this.db.withDefaults(this.table, r));
        for (const r of rows) {
          if (!this.rls.canInsert(this.table, r)) throw new MockError(`new row violates row-level security policy for table "${this.table}"`);
          this.db.assertForeignKeys(this.table, r);
        }
        const staged: Row[] = [];
        try {
          for (const r of rows) { this.db.assertUnique(this.table, r); t[this.table].push(r); staged.push(r); }
        } catch (e) {
          t[this.table] = t[this.table].filter((r) => !staged.includes(r)); // one statement, all or nothing
          throw e;
        }
        return staged;
      }
      case 'upsert': {
        const keys = (this.upsertOpts.onConflict ?? 'id').split(',').map((k) => k.trim());
        const out: Row[] = [];
        for (const raw of Array.isArray(this.payload) ? this.payload : [this.payload]) {
          const existing = t[this.table].find((r) => keys.every((k) => r[k] === raw[k]));
          if (existing) {
            if (this.upsertOpts.ignoreDuplicates) continue;
            if (!this.rls.canUpdate(this.table, existing)) throw new MockError(`new row violates row-level security policy for table "${this.table}"`);
            Object.assign(existing, raw);
            out.push(existing);
            continue;
          }
          const row = this.db.withDefaults(this.table, raw);
          if (!this.rls.canInsert(this.table, row)) throw new MockError(`new row violates row-level security policy for table "${this.table}"`);
          this.db.assertForeignKeys(this.table, row);
          this.db.assertUnique(this.table, row);
          t[this.table].push(row);
          out.push(row);
        }
        return out;
      }
      case 'update': {
        const patch = this.payload as Row;
        const rows = this.matching().filter((r) => this.rls.canUpdate(this.table, r));
        for (const r of rows) {
          this.rls.guardUpdate(this.table, r, patch);
          this.db.assertUnique(this.table, { ...r, ...patch }, [r]);
        }
        rows.forEach((r) => Object.assign(r, patch));
        return rows;
      }
      case 'delete': {
        if (this.db.failDeletes.has(this.table)) throw new MockError(`mock: delete failed on "${this.table}"`);
        const rows = this.matching().filter((r) => this.rls.canDelete(this.table, r));
        t[this.table] = t[this.table].filter((r) => !rows.includes(r));
        this.db.cascade(this.table, rows.map((r) => r.id).filter(Boolean));
        return rows;
      }
    }
  }
}
