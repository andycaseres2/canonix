/**
 * In-memory stand-in for the Supabase database used when USE_MOCK is on.
 * It mirrors the tables, keys, cascades and RLS policies of supabase/01_schema.sql
 * closely enough for every page to behave as it would against Supabase.
 */

export type Row = Record<string, any>;
export type TableName = 'profiles' | 'media' | 'units' | 'media_units' | 'routes' | 'route_items' | 'progress' | 'user_routes';
export type MockUser = {
  id: string;
  email: string;
  password: string;
  banned_until: string | null;
  user_metadata: Record<string, unknown>;
  created_at: string;
};

type ForeignKey = { table: TableName; column: string; ref: TableName | 'users' };

export const FOREIGN_KEYS: ForeignKey[] = [
  { table: 'profiles', column: 'id', ref: 'users' },
  { table: 'media_units', column: 'media_id', ref: 'media' },
  { table: 'media_units', column: 'unit_id', ref: 'units' },
  { table: 'route_items', column: 'route_id', ref: 'routes' },
  { table: 'route_items', column: 'media_id', ref: 'media' },
  { table: 'progress', column: 'user_id', ref: 'users' },
  { table: 'progress', column: 'unit_id', ref: 'units' },
  { table: 'user_routes', column: 'user_id', ref: 'users' },
  { table: 'user_routes', column: 'route_id', ref: 'routes' },
];

const UNIQUE_KEYS: Record<TableName, string[][]> = {
  profiles: [['id']],
  media: [['id'], ['slug']],
  units: [['id'], ['label']],
  media_units: [['media_id', 'unit_id']],
  routes: [['id'], ['slug']],
  route_items: [['id'], ['route_id', 'media_id']],
  progress: [['user_id', 'unit_id']],
  user_routes: [['user_id', 'route_id']],
};

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

const DEFAULTS: Record<TableName, () => Row> = {
  profiles: () => ({ display_name: null, role: 'user', plan: 'free', created_at: now() }),
  media: () => ({
    id: uuid(), universe: null, credits: null, year_label: null, year_start: null, description: null, search_hint: null,
    cover_url: null, where_label: null, where_url: null, created_at: now(),
  }),
  units: () => ({ id: uuid(), file_path: null, file_format: null, file_size: null }),
  media_units: () => ({ group_name: null }),
  routes: () => ({ id: uuid(), kind: 'comic', description: null, published: false, requires_plan: 'free', position: 0, created_at: now() }),
  route_items: () => ({ id: uuid(), section: null, note: null }),
  progress: () => ({ completed_at: now() }),
  user_routes: () => ({ started_at: now() }),
};

import { MockStorage } from './storage';

export class MockError extends Error {}

export class MockDb {
  users: MockUser[] = [];
  storage = new MockStorage();
  tables: Record<TableName, Row[]> = {
    profiles: [], media: [], units: [], media_units: [], routes: [], route_items: [], progress: [], user_routes: [],
  };

  /** Creates an auth user plus its profile, like the on_auth_user_created trigger. */
  addUser(u: { id?: string; email: string; password: string; display_name?: string; role?: 'user' | 'admin'; plan?: 'free' | 'premium'; created_at?: string }) {
    const user: MockUser = {
      id: u.id ?? uuid(), email: u.email, password: u.password, banned_until: null,
      user_metadata: { display_name: u.display_name }, created_at: u.created_at ?? now(),
    };
    this.users.push(user);
    this.tables.profiles.push({
      ...DEFAULTS.profiles(), id: user.id, email: user.email, created_at: user.created_at,
      display_name: u.display_name ?? user.email.split('@')[0], role: u.role ?? 'user', plan: u.plan ?? 'free',
    });
    return user;
  }

  deleteUser(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
    this.cascade('users', [id]);
  }

  profile(uid: string | null) {
    return uid ? this.tables.profiles.find((p) => p.id === uid) ?? null : null;
  }

  withDefaults(table: TableName, row: Row) {
    return { ...DEFAULTS[table](), ...row };
  }

  /** Throws when a row would break a unique key, ignoring the rows in `except`. */
  assertUnique(table: TableName, row: Row, except: Row[] = []) {
    for (const cols of UNIQUE_KEYS[table]) {
      const clash = this.tables[table].find((r) => !except.includes(r) && cols.every((c) => r[c] === row[c]));
      if (clash) throw new MockError(`duplicate key value violates unique constraint "${table}_${cols.join('_')}_key"`);
    }
  }

  assertForeignKeys(table: TableName, row: Row) {
    for (const fk of FOREIGN_KEYS.filter((k) => k.table === table)) {
      const target = fk.ref === 'users' ? this.users : this.tables[fk.ref];
      if (!target.some((r) => r.id === row[fk.column])) {
        throw new MockError(`insert or update on table "${table}" violates foreign key constraint "${table}_${fk.column}_fkey"`);
      }
    }
  }

  /** ON DELETE CASCADE for every foreign key that points at the deleted ids. */
  cascade(ref: TableName | 'users', ids: string[]) {
    if (!ids.length) return;
    for (const fk of FOREIGN_KEYS.filter((k) => k.ref === ref)) {
      const gone = this.tables[fk.table].filter((r) => ids.includes(r[fk.column]));
      if (!gone.length) continue;
      this.tables[fk.table] = this.tables[fk.table].filter((r) => !gone.includes(r));
      this.cascade(fk.table, gone.map((r) => r.id).filter(Boolean));
    }
  }
}

/** Row level security, mirroring the policies in supabase/01_schema.sql. */
export class Policies {
  constructor(private db: MockDb, private uid: string | null) {}

  get isAdmin() {
    return this.db.profile(this.uid)?.role === 'admin';
  }

  canRead(table: TableName, row: Row): boolean {
    switch (table) {
      case 'profiles': return row.id === this.uid || this.isAdmin;
      case 'routes': return row.published === true || this.isAdmin;
      case 'progress':
      case 'user_routes': return row.user_id === this.uid || this.isAdmin;
      case 'route_items': return this.canReadRoute(row.route_id);
      default: return true;
    }
  }

  /** public.can_read_route(): published and within the viewer's plan, or admin. */
  canReadRoute(routeId: string) {
    if (this.isAdmin) return true;
    const route = this.db.tables.routes.find((r) => r.id === routeId);
    if (!route?.published) return false;
    return route.requires_plan === 'free' || this.db.profile(this.uid)?.plan === 'premium';
  }

  canInsert(table: TableName, row: Row): boolean {
    if (table === 'progress') return !!this.uid && row.user_id === this.uid;
    if (table === 'user_routes') return !!this.uid && row.user_id === this.uid && this.canReadRoute(row.route_id);
    if (table === 'profiles') return false;
    return this.isAdmin;
  }

  canUpdate(table: TableName, row: Row): boolean {
    if (table === 'profiles') return row.id === this.uid || this.isAdmin;
    if (table === 'progress' || table === 'user_routes') return false;
    return this.isAdmin;
  }

  canDelete(table: TableName, row: Row): boolean {
    if (table === 'progress' || table === 'user_routes') return row.user_id === this.uid;
    if (table === 'profiles') return false;
    return this.isAdmin;
  }

  /** guard_profile_update trigger: non admins cannot change role, plan or email. */
  guardUpdate(table: TableName, before: Row, patch: Row) {
    if (table !== 'profiles' || this.isAdmin || !this.uid) return;
    if (['role', 'plan', 'email'].some((k) => k in patch && patch[k] !== before[k])) {
      throw new MockError('No autorizado para cambiar rol, plan o correo');
    }
  }

  visible(table: TableName) {
    return this.db.tables[table].filter((r) => this.canRead(table, r));
  }
}
