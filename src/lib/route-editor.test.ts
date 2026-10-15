import { describe, expect, it } from 'vitest';
import { POST as routes } from '../pages/api/admin/routes';
import { POST as items } from '../pages/api/admin/route-items';
import type { MockDb } from '../test/mock/db';
import { ADMIN, as, fixture } from '../test/mock/fixture';

const ORIGIN = 'http://x';

async function post(handler: any, db: MockDb, fields: Record<string, string | string[]>) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach((x) => body.append(k, x)));
  const request = new Request(`${ORIGIN}/api`, { method: 'POST', body });
  const res: Response = await handler({
    request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  });
  const u = new URL(res.headers.get('Location') ?? '/', ORIGIN);
  return { path: u.pathname, ok: u.searchParams.get('ok'), error: u.searchParams.get('error') };
}

const route = (db: MockDb, id: string) => db.tables.routes.find((r) => r.id === id)!;
const stagesOf = (db: MockDb, routeId: string) =>
  db.tables.route_sections.filter((s) => s.route_id === routeId).sort((a, b) => a.position - b.position);
const itemsOf = (db: MockDb, sectionId: string) =>
  db.tables.route_items.filter((i) => i.section_id === sectionId).sort((a, b) => a.position - b.position).map((i) => i.media_id);

describe('routes: create and update ask only for name and description', () => {
  it('creates a draft route from name and description, last in the list', async () => {
    const db = fixture();
    const res = await post(routes, db, { action: 'create', name: 'Ruta DC', description: 'Lo esencial de DC' });
    const created = db.tables.routes.find((r) => r.name === 'Ruta DC')!;
    expect(res.path).toBe(`/admin/rutas/${created.id}`);
    expect(created).toMatchObject({ slug: 'ruta-dc', description: 'Lo esencial de DC', published: false, requires_plan: 'free', universe: 'otros', kind: 'comic' });
    expect(created.position).toBeGreaterThan(Math.max(...db.tables.routes.filter((r) => r !== created).map((r) => r.position)));
  });

  it('requires a name', async () => {
    expect((await post(routes, fixture(), { action: 'create', name: ' ' })).error).toBe('Falta el nombre.');
  });

  it('update changes name, description, publication and plan but keeps the slug', async () => {
    const db = fixture();
    const res = await post(routes, db, { action: 'update', id: 'r2', name: 'Nuevo nombre', description: 'Otra', published: 'on', requires_plan: 'premium' });
    expect(res.ok).toBe('Guardado.');
    expect(route(db, 'r2')).toMatchObject({ name: 'Nuevo nombre', slug: 'draft', description: 'Otra', published: true, requires_plan: 'premium' });
  });
});

describe('stages', () => {
  it('creates a stage with title and description at the end', async () => {
    const db = fixture();
    const res = await post(items, db, { action: 'section_create', route_id: 'r1', title: 'Años 70', description: 'La era Claremont' });
    expect(res.error).toBeNull();
    expect(stagesOf(db, 'r1').map((s) => [s.title, s.description, s.position])).toEqual([['A', 'Primera etapa', 1], ['Años 70', 'La era Claremont', 2]]);
  });

  it('requires a stage title', async () => {
    expect((await post(items, fixture(), { action: 'section_create', route_id: 'r1', title: '' })).error).toBe('Ponle un título a la etapa.');
  });

  it('updates title and description', async () => {
    const db = fixture();
    await post(items, db, { action: 'section_update', route_id: 'r1', id: 's1', title: 'Años 60', description: '' });
    expect(stagesOf(db, 'r1')[0]).toMatchObject({ title: 'Años 60', description: null });
  });

  it('moves stages up and down', async () => {
    const db = fixture();
    await post(items, db, { action: 'section_create', route_id: 'r1', title: 'B' });
    const b = stagesOf(db, 'r1')[1].id;
    await post(items, db, { action: 'section_move', route_id: 'r1', id: b, dir: 'up' });
    expect(stagesOf(db, 'r1').map((s) => s.title)).toEqual(['B', 'A']);
  });

  it('deleting a stage removes its titles from the route', async () => {
    const db = fixture();
    const res = await post(items, db, { action: 'section_delete', route_id: 'r1', id: 's1' });
    expect(res.ok).toBe('Etapa borrada.');
    expect(db.tables.route_items.filter((i) => i.route_id === 'r1')).toEqual([]);
  });
});

describe('titles inside a stage', () => {
  it('adds a title to a stage, at the end of that stage', async () => {
    const db = fixture();
    await post(items, db, { action: 'section_create', route_id: 'r3', title: 'Extra' });
    const extra = stagesOf(db, 'r3')[1].id;
    const res = await post(items, db, { action: 'item_add', route_id: 'r3', section_id: extra, media_id: 'm1' });
    expect(res.ok).toBe('Agregado.');
    expect(itemsOf(db, extra)).toEqual(['m1']);
  });

  it('refuses a title already in the route and a stage from another route', async () => {
    const db = fixture();
    expect((await post(items, db, { action: 'item_add', route_id: 'r1', section_id: 's1', media_id: 'm1' })).error).toBe('Ese título ya está en la ruta.');
    expect((await post(items, db, { action: 'item_add', route_id: 'r1', section_id: 's3', media_id: 'm3' })).error).toBe('Etapa no encontrada.');
  });

  it('adds several picked titles at once, in the order they were picked', async () => {
    const db = fixture();
    db.tables.media.push({ id: 'm4', slug: 'xmen', kind: 'comic', title: 'X-Men', year_start: 1963 });
    await post(items, db, { action: 'section_create', route_id: 'r3', title: 'Extra' });
    const extra = stagesOf(db, 'r3')[1].id;
    const res = await post(items, db, { action: 'item_add', route_id: 'r3', section_id: extra, media_id: ['m4', 'm1', 'm2'] });
    expect(res.ok).toBe('Se agregaron 3.');
    expect(itemsOf(db, extra)).toEqual(['m4', 'm1', 'm2']);
  });

  it('skips picked titles that are already in the route and says so', async () => {
    const db = fixture();
    db.tables.media.push({ id: 'm4', slug: 'xmen', kind: 'comic', title: 'X-Men', year_start: 1963 });
    const res = await post(items, db, { action: 'item_add', route_id: 'r1', section_id: 's1', media_id: ['m1', 'm4'] });
    expect(res.ok).toBe('Agregado. 1 ya estaba en la ruta.');
    expect(itemsOf(db, 's1')).toEqual(['m2', 'm1', 'm4']);
  });

  it('moves a title inside its stage and removes it', async () => {
    const db = fixture();
    await post(items, db, { action: 'item_move', route_id: 'r1', id: 'i2', dir: 'up' });
    expect(itemsOf(db, 's1')).toEqual(['m1', 'm2']);
    await post(items, db, { action: 'item_remove', route_id: 'r1', id: 'i2' });
    expect(itemsOf(db, 's1')).toEqual(['m2']);
  });
});

describe('universe and kind are derived from the titles', () => {
  it('follow what the route contains', async () => {
    const db = fixture();
    db.tables.media.find((m) => m.id === 'm1')!.universe = 'marvel';
    db.tables.media.find((m) => m.id === 'm2')!.universe = 'marvel';
    db.tables.media.find((m) => m.id === 'm3')!.universe = 'manga';
    await post(items, db, { action: 'item_remove', route_id: 'r1', id: 'i2' });
    expect(route(db, 'r1')).toMatchObject({ universe: 'marvel', kind: 'comic' });
    await post(items, db, { action: 'item_add', route_id: 'r1', section_id: 's1', media_id: 'm3' });
    expect(route(db, 'r1')).toMatchObject({ kind: 'mixed' });
  });

  it('a route with only mangas is a manga route', async () => {
    const db = fixture();
    await post(items, db, { action: 'item_remove', route_id: 'r1', id: 'i1' });
    await post(items, db, { action: 'item_remove', route_id: 'r1', id: 'i2' });
    await post(items, db, { action: 'item_add', route_id: 'r1', section_id: 's1', media_id: 'm3' });
    expect(route(db, 'r1')).toMatchObject({ kind: 'manga' });
  });
});
