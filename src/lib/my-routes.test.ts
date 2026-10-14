import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/my-routes';
import { getStartedRoutes } from './data';
import type { MockDb } from '../test/mock/db';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';

async function post(db: MockDb, uid: string | null, fields: Record<string, string>) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.set(k, v));
  const sb = as(db, uid);
  const res = await POST({
    request: new Request('http://x/api/my-routes', { method: 'POST', body }),
    locals: { supabase: sb, user: uid ? (await sb.auth.getUser()).data.user : null },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as any);
  const url = new URL((res as Response).headers.get('Location') ?? '', 'http://x');
  return { path: url.pathname, ok: url.searchParams.get('ok'), error: url.searchParams.get('error') };
}

const started = (db: MockDb, uid: string) => db.tables.user_routes.filter((r) => r.user_id === uid).map((r) => r.route_id);

describe('POST /api/my-routes', () => {
  it('starts a free route for a signed-in user and redirects back to the route', async () => {
    const db = fixture();
    const res = await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    expect(res).toMatchObject({ path: '/rutas/free', error: null });
    expect(res.ok).toContain('Ruta iniciada');
    expect(started(db, READER)).toEqual(['r1']);
  });

  it('starting twice keeps a single entry with the first date', async () => {
    const db = fixture();
    await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    const first = db.tables.user_routes[0].started_at;
    await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    expect(db.tables.user_routes).toHaveLength(1);
    expect(db.tables.user_routes[0].started_at).toBe(first);
  });

  it('refuses a premium route for a free user', async () => {
    const db = fixture();
    const res = await post(db, READER, { action: 'start', route_id: 'r3', slug: 'paid' });
    expect(res.error).toContain('No puedes iniciar esta ruta');
    expect(started(db, READER)).toEqual([]);
  });

  it('lets a premium user start a premium route', async () => {
    const db = fixture();
    await post(db, PREMIUM, { action: 'start', route_id: 'r3', slug: 'paid' });
    expect(started(db, PREMIUM)).toEqual(['r3']);
  });

  it('sends anonymous visitors to log in and come back', async () => {
    const res = await post(fixture(), null, { action: 'start', route_id: 'r1', slug: 'free' });
    expect(res.path).toBe('/login');
  });

  it('leaving a route removes it but keeps the progress history', async () => {
    const db = fixture();
    await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    await as(db, READER).from('progress').insert({ user_id: READER, unit_id: 'u1' });
    const res = await post(db, READER, { action: 'leave', route_id: 'r1', slug: 'free' });
    expect(res.ok).toContain('Quitaste la ruta');
    expect(started(db, READER)).toEqual([]);
    expect(db.tables.progress).toHaveLength(1);
  });

  it('ignores an unsafe slug in the redirect', async () => {
    const res = await post(fixture(), READER, { action: 'start', route_id: 'r1', slug: '//evil.com' });
    expect(res.path).toBe('/rutas');
  });
});

describe('user_routes row level security', () => {
  it('users only see their own started routes, admins see all', async () => {
    const db = fixture();
    await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    await post(db, PREMIUM, { action: 'start', route_id: 'r3', slug: 'paid' });
    expect((await as(db, READER).from('user_routes').select('route_id')).data).toEqual([{ route_id: 'r1' }]);
    expect((await as(db, ADMIN).from('user_routes').select('route_id')).data).toHaveLength(2);
  });

  it('a user cannot start a route for someone else', async () => {
    const { error } = await as(fixture(), READER).from('user_routes').insert({ user_id: PREMIUM, route_id: 'r1' });
    expect(error?.message).toMatch(/row-level security/);
  });
});

describe('getStartedRoutes', () => {
  it('maps route ids to their start date for the user', async () => {
    const db = fixture();
    await post(db, READER, { action: 'start', route_id: 'r1', slug: 'free' });
    const map = await getStartedRoutes(as(db, READER), READER);
    expect([...map.keys()]).toEqual(['r1']);
    expect(typeof map.get('r1')).toBe('string');
    expect((await getStartedRoutes(as(db, READER), undefined)).size).toBe(0);
  });
});
