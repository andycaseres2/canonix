import { describe, expect, it, vi } from 'vitest';
import { GET } from '../pages/api/reader/[slug]/[n]';
import type { MockDb } from '../test/mock/db';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';
import { PAGE_BATCH_MAX } from './reader';

const names = (n: number) => Array.from({ length: n }, (_, i) => `${String(i + 1).padStart(3, '0')}.jpg`);

/** ASM #1 has 120 pages, ASM #2 is a PDF, FF #1 has no file and Naruto (premium) #1 has 3 pages. */
function library() {
  const db = fixture();
  const set = (id: string, fields: object) => Object.assign(db.tables.units.find((u) => u.id === id)!, fields);
  set('u1', { file_path: 'asm/00001-1/', pages: names(120), file_format: 'cbz' });
  set('u2', { file_path: 'asm/00002-1.pdf', pages: null, file_format: 'pdf' });
  set('u4', { file_path: 'naruto/00001-1/', pages: names(3), file_format: 'cbz' });
  return db;
}

async function get(db: MockDb, uid: string | null, slug: string, n: string, query = '', sb = as(db, uid)) {
  const profile = uid ? db.profile(uid) : null;
  const url = new URL(`http://x/api/reader/${slug}/${n}${query}`);
  const res: Response = await (GET as any)({ params: { slug, n }, url, request: new Request(url), locals: { supabase: sb, user: uid ? { id: uid } : null, profile } });
  return { status: res.status, cache: res.headers.get('Cache-Control'), body: await res.json().catch(() => null) };
}

describe('GET /api/reader/[slug]/[n]', () => {
  it('signs only the requested range of pages, in order', async () => {
    const db = library();
    const signs = vi.spyOn(db.storage, 'issueReadToken');
    const { status, cache, body } = await get(db, READER, 'asm', '1', '?from=40&count=20');
    expect(status).toBe(200);
    expect(cache).toBe('private, no-store');
    expect(body).toMatchObject({ count: 120, from: 40 });
    expect(body.pages).toHaveLength(20);
    expect(body.pages[0]).toMatch(/\/object\/sign\/content\/asm\/00001-1\/041\.jpg\?token=/);
    expect(body.pages[19]).toMatch(/\/object\/sign\/content\/asm\/00001-1\/060\.jpg\?token=/);
    expect(signs).toHaveBeenCalledTimes(20);
  });

  it('caps the batch size and stops at the last page', async () => {
    const db = library();
    expect((await get(db, READER, 'asm', '1', '?from=0&count=5000')).body.pages).toHaveLength(PAGE_BATCH_MAX);
    const tail = await get(db, READER, 'asm', '1', '?from=110&count=20');
    expect(tail.body.pages).toHaveLength(10);
    expect(tail.body.pages[9]).toMatch(/\/asm\/00001-1\/120\.jpg\?token=/);
  });

  it.each(['?from=120', '?from=-1', '?from=abc', '?from=2&count=0'])('refuses an out-of-range batch %s', async (query) => {
    const { status, cache, body } = await get(library(), READER, 'asm', '1', query);
    expect(status).toBe(400);
    expect(cache).toBe('private, no-store');
    expect(body).toEqual({ error: 'Página fuera de rango.' });
  });

  it('signs the single file again for a PDF or video', async () => {
    const { status, cache, body } = await get(library(), READER, 'asm', '2');
    expect(status).toBe(200);
    expect(cache).toBe('private, no-store');
    expect(Object.keys(body)).toEqual(['url']);
    expect(body.url).toMatch(/\/object\/sign\/content\/asm\/00002-1\.pdf\?token=/);
  });

  it('refuses anonymous visitors, locked titles and missing files exactly like the reader page', async () => {
    const db = library();
    const signs = vi.spyOn(db.storage, 'issueReadToken');
    expect(await get(db, null, 'asm', '1', '?from=0')).toEqual({ status: 401, cache: 'private, no-store', body: { error: 'Inicia sesión.' } });
    expect(await get(db, READER, 'naruto', '1', '?from=0')).toEqual({ status: 403, cache: 'private, no-store', body: { error: 'Este título es premium.' } });
    expect(await get(db, READER, 'ff', '1')).toEqual({ status: 404, cache: 'private, no-store', body: { error: 'No encontrado.' } });
    expect(await get(db, READER, 'nope', '1')).toEqual({ status: 404, cache: 'private, no-store', body: { error: 'No encontrado.' } });
    expect(await get(db, READER, 'asm', '99')).toEqual({ status: 404, cache: 'private, no-store', body: { error: 'No encontrado.' } });
    expect(signs).not.toHaveBeenCalled();
  });

  it('opens a premium title for premium readers and admins', async () => {
    expect((await get(library(), PREMIUM, 'naruto', '1', '?from=0')).body.pages).toHaveLength(3);
    expect((await get(library(), ADMIN, 'naruto', '1', '?from=0')).body.pages).toHaveLength(3);
  });

  it('only ever signs files of the title and number in the URL', async () => {
    const { body } = await get(library(), PREMIUM, 'asm', '1', '?from=0&count=50');
    expect(body.pages.every((u: string) => u.includes('/object/sign/content/asm/00001-1/'))).toBe(true);
  });

  it('reports a signing refusal from storage instead of empty links', async () => {
    const db = library();
    const sb = as(db, READER) as any;
    const from = sb.storage.from;
    // Storage RLS refusing every path, the way Supabase reports it per entry
    sb.storage.from = (bucket: string) => ({
      ...from(bucket),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, error: 'denied', signedUrl: '' })), error: null }),
      createSignedUrl: async () => ({ data: null, error: { message: 'denied' } }),
    });
    for (const n of ['1', '2']) {
      const { status, cache, body } = await get(db, READER, 'asm', n, n === '1' ? '?from=0' : '', sb);
      expect({ status, cache, body }).toEqual({ status: 502, cache: 'private, no-store', body: { error: 'No se pudieron preparar los enlaces.' } });
    }
  });
});
