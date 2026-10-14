import type { SupabaseClient } from '@supabase/supabase-js';
import { MockDb, MockError, Policies, type MockUser, type TableName } from './db';
import { Query } from './query';
import { BUCKETS, objectUrl, type BucketName } from './storage';

/** Where the mock keeps the signed-in user id (a cookie in the app, memory in tests). */
export type SessionStore = { get(): string | null; set(userId: string): void; clear(): void };

const fail = (message: string) => ({ message, status: 400, name: 'AuthApiError' });

function toUser(u: MockUser) {
  return {
    id: u.id, email: u.email, user_metadata: u.user_metadata, app_metadata: {}, aud: 'authenticated',
    created_at: u.created_at, banned_until: u.banned_until,
  };
}

const isBanned = (u: MockUser) => !!u.banned_until && new Date(u.banned_until) > new Date();

/** public.route_unit_map(): counts for every published route, unit ids only for routes the viewer can read. */
function routeUnitMap(db: MockDb, rls: Policies) {
  const t = db.tables;
  return t.routes.filter((r) => r.published).map((r) => {
    const mediaIds = new Set(t.route_items.filter((i) => i.route_id === r.id).map((i) => i.media_id));
    const unitIds = new Set(t.media_units.filter((mu) => mediaIds.has(mu.media_id)).map((mu) => mu.unit_id));
    return { route_id: r.id, item_count: mediaIds.size, unit_count: unitIds.size, unit_ids: rls.canReadRoute(r.id) ? [...unitIds] : [] };
  });
}

export function createMockClient(db: MockDb, session: SessionStore) {
  const currentUser = () => {
    const id = session.get();
    const user = id ? db.users.find((u) => u.id === id) : undefined;
    return user && !isBanned(user) ? user : null;
  };
  const rls = () => new Policies(db, currentUser()?.id ?? null);

  const denied = { message: 'new row violates row-level security policy for table "objects"' };
  const storage = {
    from: (bucket: BucketName) => {
      if (!BUCKETS[bucket]) throw new Error(`Bucket ${bucket} not found`);
      return {
        async createSignedUploadUrl(path: string) {
          if (!rls().isAdmin) return { data: null, error: denied };
          const token = db.storage.issueUploadToken(bucket, path);
          return { data: { signedUrl: `/api/mock-storage/upload?token=${token}`, token, path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: objectUrl(bucket, path) } }),
        async createSignedUrl(path: string, seconds: number) {
          if (!rls().isAdmin) return { data: null, error: denied };
          return { data: { signedUrl: `${objectUrl(bucket, path)}&token=${db.storage.issueReadToken(bucket, path, seconds)}` }, error: null };
        },
        async list(dir: string, opts: { search?: string; limit?: number } = {}) {
          if (!rls().isAdmin) return { data: [], error: null };
          return { data: db.storage.list(bucket, dir, opts.search ?? '', opts.limit ?? 100), error: null };
        },
        async remove(paths: string[]) {
          if (!rls().isAdmin) return { data: [], error: null };
          return { data: db.storage.remove(bucket, paths).map((name) => ({ name })), error: null };
        },
      };
    },
  };

  return {
    from: (table: TableName) => new Query(db, table, rls()),
    storage,

    async rpc(name: string) {
      if (name === 'route_unit_map') return { data: routeUnitMap(db, rls()), error: null };
      if (name !== 'admin_user_stats') return { data: null, error: { message: `function ${name} does not exist` } };
      if (!rls().isAdmin) return { data: [], error: null };
      const stats = new Map<string, { user_id: string; units_done: number; last_activity: string }>();
      for (const p of db.tables.progress) {
        const s = stats.get(p.user_id) ?? { user_id: p.user_id, units_done: 0, last_activity: p.completed_at };
        s.units_done++;
        if (p.completed_at > s.last_activity) s.last_activity = p.completed_at;
        stats.set(p.user_id, s);
      }
      return { data: [...stats.values()], error: null };
    },

    auth: {
      async getUser() {
        const user = currentUser();
        return { data: { user: user ? toUser(user) : null }, error: user ? null : fail('Auth session missing!') };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user || user.password !== password) return { data: { user: null, session: null }, error: fail('Invalid login credentials') };
        if (isBanned(user)) return { data: { user: null, session: null }, error: fail('User is banned') };
        session.set(user.id);
        return { data: { user: toUser(user), session: { user: toUser(user) } }, error: null };
      },
      async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { display_name?: string } } }) {
        if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          return { data: { user: null, session: null }, error: fail('User already registered') };
        }
        const user = db.addUser({ email, password, display_name: options?.data?.display_name || undefined });
        session.set(user.id);
        return { data: { user: toUser(user), session: { user: toUser(user) } }, error: null };
      },
      async signOut() {
        session.clear();
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
}

/** Service-role client: only the auth.admin calls the users panel needs. */
export function createMockServiceClient(db: MockDb) {
  const find = (id: string) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new MockError('User not found');
    return user;
  };
  const wrap = async <T>(fn: () => T) => {
    try { return { data: fn(), error: null }; } catch (e) { return { data: null, error: fail((e as Error).message) }; }
  };
  return {
    auth: {
      admin: {
        listUsers: () => wrap(() => ({ users: db.users.map(toUser) })),
        updateUserById: (id: string, attrs: { ban_duration?: string }) => wrap(() => {
          const user = find(id);
          if (attrs.ban_duration === 'none') user.banned_until = null;
          else if (attrs.ban_duration) {
            const hours = parseInt(attrs.ban_duration, 10);
            user.banned_until = new Date(Date.now() + hours * 36e5).toISOString();
          }
          return { user: toUser(user) };
        }),
        deleteUser: (id: string) => wrap(() => { find(id); db.deleteUser(id); return {}; }),
      },
    },
  } as unknown as SupabaseClient;
}
