import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/admin/media';
import type { MockDb } from '../test/mock/db';
import { publicObjectUrl } from '../test/mock/storage';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';

async function remove(db: MockDb, id: string, uid = ADMIN) {
  const body = new FormData();
  body.set('action', 'delete');
  body.set('id', id);
  const res: Response = await POST({
    request: new Request('http://x/api/admin/media', { method: 'POST', body }),
    locals: { supabase: as(db, uid) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as any);
  const to = new URL(res.headers.get('Location') ?? '', 'http://x');
  return { path: to.pathname, ok: to.searchParams.get('ok'), error: to.searchParams.get('error') };
}

/** Stores bytes at `path`, like a finished upload. */
const store = (db: MockDb, bucket: 'content' | 'covers', path: string) =>
  db.storage.acceptUpload(db.storage.issueUploadToken(bucket, path), new Uint8Array(3), 'image/jpeg');

/**
 * Naruto (m3) has its own paged unit u4 and shares FF #1 (u3, a single file) with Fantastic Four;
 * it is in routes r1 (with two comics) and r3 (alone), and has an uploaded cover. Readers marked both units.
 */
function withNaruto() {
  const db = fixture();
  const t = db.tables;
  Object.assign(t.units.find((u) => u.id === 'u4')!, { file_path: 'naruto/00001-1/', pages: ['001.jpg', '002.jpg'], file_format: 'cbz' });
  ['001.jpg', '002.jpg'].forEach((p) => store(db, 'content', `naruto/00001-1/${p}`));
  Object.assign(t.units.find((u) => u.id === 'u3')!, { file_path: 'ff/00001-1.cbz', file_format: 'cbz' });
  store(db, 'content', 'ff/00001-1.cbz');
  t.media_units.push({ media_id: 'm3', unit_id: 'u3', short: '0', group_name: null, position: 0 });
  t.media.find((m) => m.id === 'm3')!.cover_url = publicObjectUrl('covers', 'naruto/cover-1.jpg');
  store(db, 'covers', 'naruto/cover-1.jpg');
  t.route_items.push({ id: 'i4', route_id: 'r1', section_id: 's1', media_id: 'm3', position: 3 });
  t.routes.find((r) => r.id === 'r1')!.kind = 'mixed';
  t.routes.find((r) => r.id === 'r3')!.kind = 'manga';
  t.progress.push({ user_id: PREMIUM, unit_id: 'u4', completed_at: '2026-01-01' }, { user_id: PREMIUM, unit_id: 'u3', completed_at: '2026-01-01' });
  return db;
}

describe('POST /api/admin/media delete', () => {
  it('deletes the title, its links and route items, and the units only it had with their progress and pages', async () => {
    const db = withNaruto();
    expect(await remove(db, 'm3')).toEqual({ path: '/admin/media', ok: 'Título borrado.', error: null });
    const t = db.tables;
    expect(t.media.some((m) => m.id === 'm3')).toBe(false);
    expect(t.media_units.some((mu) => mu.media_id === 'm3')).toBe(false);
    expect(t.route_items.some((ri) => ri.media_id === 'm3')).toBe(false);
    expect(t.units.some((u) => u.id === 'u4')).toBe(false);
    expect(t.progress.some((p) => p.unit_id === 'u4')).toBe(false);
    expect(db.storage.read('content', 'naruto/00001-1/001.jpg')).toBeNull();
    expect(db.storage.read('content', 'naruto/00001-1/002.jpg')).toBeNull();
  });

  it('keeps a unit another title still has, with its file and progress', async () => {
    const db = withNaruto();
    await remove(db, 'm3');
    const t = db.tables;
    expect(t.units.find((u) => u.id === 'u3')).toMatchObject({ file_path: 'ff/00001-1.cbz' });
    expect(t.media_units.some((mu) => mu.media_id === 'm2' && mu.unit_id === 'u3')).toBe(true);
    expect(t.progress.some((p) => p.unit_id === 'u3')).toBe(true);
    expect(db.storage.read('content', 'ff/00001-1.cbz')).not.toBeNull();
    // The other titles keep their units
    expect(t.units.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('deletes the uploaded cover', async () => {
    const db = withNaruto();
    await remove(db, 'm3');
    expect(db.storage.read('covers', 'naruto/cover-1.jpg')).toBeNull();
  });

  it('recomputes the kind and universe of the routes it was in', async () => {
    const db = withNaruto();
    await remove(db, 'm3');
    expect(db.tables.routes.find((r) => r.id === 'r1')).toMatchObject({ kind: 'comic' });
    expect(db.tables.routes.find((r) => r.id === 'r3')).toMatchObject({ kind: 'comic', universe: 'otros' });
  });

  it('reports a database error and changes nothing', async () => {
    const db = withNaruto();
    db.failDeletes.add('media');
    const before = JSON.stringify(db.tables);
    const { path, ok, error } = await remove(db, 'm3');
    expect({ path, ok }).toEqual({ path: '/admin/media/m3', ok: null });
    expect(error).toContain('delete failed');
    expect(JSON.stringify(db.tables)).toBe(before);
    expect(db.storage.read('content', 'naruto/00001-1/001.jpg')).not.toBeNull();
    expect(db.storage.read('covers', 'naruto/cover-1.jpg')).not.toBeNull();
  });

  it('reports success with a warning when stored files cannot be deleted', async () => {
    const db = withNaruto();
    db.storage.failRemove.add('content');
    const { path, ok } = await remove(db, 'm3');
    expect(path).toBe('/admin/media');
    expect(ok).toBe('Título borrado. Algunos archivos no se pudieron borrar del almacenamiento.');
    expect(db.tables.media.some((m) => m.id === 'm3')).toBe(false);
    expect(db.tables.units.some((u) => u.id === 'u4')).toBe(false);
    expect(db.storage.read('covers', 'naruto/cover-1.jpg')).toBeNull();
  });

  it('warns too when the cover cannot be deleted', async () => {
    const db = withNaruto();
    db.storage.failRemove.add('covers');
    const { ok } = await remove(db, 'm3');
    expect(ok).toBe('Título borrado. Algunos archivos no se pudieron borrar del almacenamiento.');
    expect(db.storage.read('content', 'naruto/00001-1/001.jpg')).toBeNull();
  });

  it('a reader cannot delete a title', async () => {
    const db = withNaruto();
    const before = JSON.stringify(db.tables);
    const { error } = await remove(db, 'm3', READER);
    expect(error).toBe('No se pudo borrar el título.');
    expect(JSON.stringify(db.tables)).toBe(before);
    expect(db.storage.read('content', 'naruto/00001-1/001.jpg')).not.toBeNull();
  });

  it('answers a title that does not exist', async () => {
    expect(await remove(fixture(), 'nope')).toEqual({ path: '/admin/media', ok: null, error: 'Título no encontrado.' });
  });
});
