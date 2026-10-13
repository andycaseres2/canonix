import { describe, expect, it } from 'vitest';
import { MockDb } from './db';
import { createMockClient, createMockServiceClient, type SessionStore } from './client';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const READER = '00000000-0000-4000-8000-000000000002';

function memorySession(initial: string | null = null): SessionStore & { value: string | null } {
  return { value: initial, get() { return this.value; }, set(v) { this.value = v; }, clear() { this.value = null; } };
}

function fixture() {
  const db = new MockDb();
  db.addUser({ id: ADMIN, email: 'admin@demo.com', password: 'demo1234', role: 'admin', plan: 'premium' });
  db.addUser({ id: READER, email: 'lector@demo.com', password: 'demo1234' });
  const t = db.tables;
  t.media.push(
    { id: 'm1', slug: 'asm', kind: 'comic', title: 'Spider-Man', year_start: 1962 },
    { id: 'm2', slug: 'ff', kind: 'comic', title: 'Fantastic Four', year_start: 1961 },
    { id: 'm3', slug: 'naruto', kind: 'anime', title: 'Naruto', year_start: 2002 },
  );
  t.units.push({ id: 'u1', label: 'ASM #1' }, { id: 'u2', label: 'ASM #2' }, { id: 'u3', label: 'FF #1' });
  t.media_units.push(
    { media_id: 'm1', unit_id: 'u2', short: '2', group_name: null, position: 2 },
    { media_id: 'm1', unit_id: 'u1', short: '1', group_name: null, position: 1 },
    { media_id: 'm2', unit_id: 'u3', short: '1', group_name: null, position: 1 },
  );
  t.routes.push(
    { id: 'r1', slug: 'free', name: 'Free', published: true, requires_plan: 'free', position: 1 },
    { id: 'r2', slug: 'draft', name: 'Draft', published: false, requires_plan: 'free', position: 2 },
    { id: 'r3', slug: 'paid', name: 'Paid', published: true, requires_plan: 'premium', position: 3 },
  );
  t.route_items.push(
    { id: 'i1', route_id: 'r1', media_id: 'm2', section: 'A', position: 1 },
    { id: 'i2', route_id: 'r1', media_id: 'm1', section: 'A', position: 2 },
    { id: 'i3', route_id: 'r3', media_id: 'm3', section: null, position: 1 },
  );
  return db;
}

const as = (db: MockDb, uid: string | null) => createMockClient(db, memorySession(uid));

describe('mock query builder', () => {
  it('filters, orders and limits rows', async () => {
    const sb = as(fixture(), null);
    const { data, error } = await sb.from('media').select('slug').eq('kind', 'comic').order('year_start', { ascending: false }).limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([{ slug: 'asm' }]);
  });

  it('supports in, gte and range', async () => {
    const sb = as(fixture(), null);
    const { data } = await sb.from('media').select('slug').in('slug', ['asm', 'naruto']).gte('year_start', 2000).range(0, 10);
    expect(data).toEqual([{ slug: 'naruto' }]);
  });

  it('returns exact count with head and no data', async () => {
    const sb = as(fixture(), null);
    const res = await sb.from('media').select('id', { count: 'exact', head: true }).eq('kind', 'comic');
    expect(res.count).toBe(2);
    expect(res.data).toBeNull();
  });

  it('embeds forward relations, aliased fk columns, reverse arrays and counts', async () => {
    const sb = as(fixture(), null);
    const { data: items } = await sb.from('route_items').select('section, media:media_id(slug, media_units(short, units(label)))').eq('route_id', 'r1').order('position');
    expect(items![0]).toEqual({ section: 'A', media: { slug: 'ff', media_units: [{ short: '1', units: { label: 'FF #1' } }] } });
    const { data: media } = await sb.from('media').select('slug, media_units(count)').eq('slug', 'asm').single();
    expect(media).toEqual({ slug: 'asm', media_units: [{ count: 2 }] });
  });

  it('single errors when no row matches and maybeSingle returns null', async () => {
    const sb = as(fixture(), null);
    expect((await sb.from('media').select('id').eq('slug', 'nope').single()).error).not.toBeNull();
    expect(await sb.from('media').select('id').eq('slug', 'nope').maybeSingle()).toMatchObject({ data: null, error: null });
  });

  it('rejects inserts that violate a unique key and returns inserted rows on select', async () => {
    const sb = as(fixture(), ADMIN);
    const dup = await sb.from('media').insert({ slug: 'asm', kind: 'comic', title: 'Dup' });
    expect(dup.error?.message).toMatch(/duplicate key/);
    const { data, error } = await sb.from('media').insert({ slug: 'xmen', kind: 'comic', title: 'X-Men' }).select('id').single();
    expect(error).toBeNull();
    expect(data!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('upsert with ignoreDuplicates keeps existing rows', async () => {
    const db = fixture();
    const sb = as(db, ADMIN);
    await sb.from('units').upsert([{ label: 'ASM #1' }, { label: 'ASM #3' }], { onConflict: 'label', ignoreDuplicates: true });
    expect(db.tables.units.filter((u) => u.label === 'ASM #1')).toEqual([{ id: 'u1', label: 'ASM #1' }]);
    expect(db.tables.units.some((u) => u.label === 'ASM #3')).toBe(true);
  });

  it('cascades deletes through foreign keys', async () => {
    const db = fixture();
    await as(db, ADMIN).from('media').delete().eq('id', 'm1');
    expect(db.tables.media_units.some((r) => r.media_id === 'm1')).toBe(false);
    expect(db.tables.route_items.some((r) => r.media_id === 'm1')).toBe(false);
  });
});

describe('mock row level security', () => {
  it('hides draft routes from non admins', async () => {
    const db = fixture();
    expect((await as(db, READER).from('routes').select('slug')).data!.map((r) => r.slug)).toEqual(['free', 'paid']);
    expect((await as(db, ADMIN).from('routes').select('slug')).data).toHaveLength(3);
  });

  it('blocks catalog writes for non admins', async () => {
    const res = await as(fixture(), READER).from('media').insert({ slug: 'x', kind: 'comic', title: 'X' });
    expect(res.error?.message).toMatch(/row-level security/);
  });

  it('lets users write only their own progress and stops role changes', async () => {
    const db = fixture();
    const sb = as(db, READER);
    expect((await sb.from('progress').insert({ user_id: ADMIN, unit_id: 'u1' })).error).not.toBeNull();
    expect((await sb.from('progress').insert({ user_id: READER, unit_id: 'u1' })).error).toBeNull();
    expect((await sb.from('progress').select('unit_id, units(label)')).data).toEqual([{ unit_id: 'u1', units: { label: 'ASM #1' } }]);
    expect((await sb.from('profiles').update({ role: 'admin' }).eq('id', READER)).error?.message).toMatch(/No autorizado/);
  });

  it('admin_user_stats only answers admins', async () => {
    const db = fixture();
    await as(db, READER).from('progress').insert({ user_id: READER, unit_id: 'u1' });
    expect((await as(db, READER).rpc('admin_user_stats')).data).toEqual([]);
    expect((await as(db, ADMIN).rpc('admin_user_stats')).data).toMatchObject([{ user_id: READER, units_done: 1 }]);
  });
});

describe('mock auth', () => {
  it('signs in with demo credentials and rejects a wrong password', async () => {
    const db = fixture();
    const session = memorySession();
    const sb = createMockClient(db, session);
    expect((await sb.auth.signInWithPassword({ email: 'lector@demo.com', password: 'bad' })).error).not.toBeNull();
    expect((await sb.auth.signInWithPassword({ email: 'lector@demo.com', password: 'demo1234' })).error).toBeNull();
    expect((await sb.auth.getUser()).data.user?.id).toBe(READER);
    await sb.auth.signOut();
    expect((await sb.auth.getUser()).data.user).toBeNull();
  });

  it('signUp creates a profile and an active session', async () => {
    const db = fixture();
    const sb = createMockClient(db, memorySession());
    const { data, error } = await sb.auth.signUp({ email: 'new@demo.com', password: 'longpass1', options: { data: { display_name: 'Nuevo' } } });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    expect(db.tables.profiles.find((p) => p.email === 'new@demo.com')).toMatchObject({ display_name: 'Nuevo', role: 'user', plan: 'free' });
  });

  it('banned users cannot sign in and deleted users lose profile and progress', async () => {
    const db = fixture();
    await as(db, READER).from('progress').insert({ user_id: READER, unit_id: 'u1' });
    const service = createMockServiceClient(db);
    await service.auth.admin.updateUserById(READER, { ban_duration: '876000h' });
    expect((await as(db, null).auth.signInWithPassword({ email: 'lector@demo.com', password: 'demo1234' })).error).not.toBeNull();
    await service.auth.admin.deleteUser(READER);
    expect(db.tables.profiles.some((p) => p.id === READER)).toBe(false);
    expect(db.tables.progress).toHaveLength(0);
  });
});
