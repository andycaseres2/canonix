import { describe, expect, it } from 'vitest';
import { POST as titles } from '../pages/api/admin/titles';
import { POST as media } from '../pages/api/admin/media';
import type { MockDb } from '../test/mock/db';
import { ADMIN, as, fixture } from '../test/mock/fixture';

const ORIGIN = 'http://x';

async function json(db: MockDb, body: unknown) {
  const request = new Request(`${ORIGIN}/api`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: ORIGIN } });
  const res: Response = await titles({ request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) } } as any);
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('POST /api/admin/titles', () => {
  it('creates a title from JSON and returns its id and slug', async () => {
    const db = fixture();
    const { status, body } = await json(db, {
      title: '  Saga de prueba ', kind: 'anime', universe: 'Anime', year_label: '2002–2007', credits: 'Studio X',
      description: 'Una saga.', search_hint: 'Saga', where_label: 'Crunchyroll', where_url: 'https://www.crunchyroll.com',
    });
    expect(status).toBe(200);
    expect(body.slug).toBe('saga-de-prueba-2002-2007');
    expect(db.tables.media.find((m) => m.id === body.id)).toMatchObject({
      title: 'Saga de prueba', kind: 'anime', universe: 'anime', year_start: 2002, cover_url: null,
    });
    // "Cómo buscarlo", "Dónde leer/ver" and "Link oficial" are no longer part of a title
    expect(db.tables.media.find((m) => m.id === body.id)).toMatchObject({ search_hint: null, where_label: null, where_url: null });
  });

  it('requires a name and defaults the kind to comic', async () => {
    const db = fixture();
    expect((await json(db, { title: '   ' })).status).toBe(400);
    const { body } = await json(db, { title: 'Otro', kind: 'video' });
    expect(db.tables.media.find((m) => m.id === body.id)).toMatchObject({ kind: 'comic' });
  });

  it('stores the access plan, free unless premium is chosen', async () => {
    const db = fixture();
    const plan = async (requires_plan?: string) => {
      const { body } = await json(db, { title: `T ${requires_plan}`, requires_plan });
      return db.tables.media.find((m) => m.id === body.id)!.requires_plan;
    };
    expect(await plan('premium')).toBe('premium');
    expect(await plan('free')).toBe('free');
    expect(await plan(undefined)).toBe('free');
    expect(await plan('gold')).toBe('free');
  });

  it('gives a duplicate name a unique slug', async () => {
    const db = fixture();
    const a = await json(db, { title: 'Repetido' });
    const b = await json(db, { title: 'Repetido' });
    expect(a.body.slug).toBe('repetido');
    expect(b.body.slug).toMatch(/^repetido-[a-z0-9]{4}$/);
  });
});

describe('POST /api/admin/media create (form) still works', () => {
  it('creates the title and redirects to its page', async () => {
    const db = fixture();
    const body = new FormData();
    Object.entries({ action: 'create', title: 'Desde formulario', kind: 'comic', universe: 'DC', year_label: '1986' }).forEach(([k, v]) => body.set(k, v));
    const request = new Request(`${ORIGIN}/api`, { method: 'POST', body });
    const res: Response = await media({
      request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) },
      redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
    } as any);
    const created = db.tables.media.find((m) => m.title === 'Desde formulario')!;
    expect(created).toMatchObject({ slug: 'desde-formulario-1986', universe: 'dc', year_start: 1986 });
    expect(res.headers.get('Location')).toContain(`/admin/media/${created.id}`);
  });
});
