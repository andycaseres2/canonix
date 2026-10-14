import { describe, expect, it } from 'vitest';
import { POST as uploads } from '../pages/api/admin/uploads';
import { POST as covers } from '../pages/api/admin/covers';
import { POST as media } from '../pages/api/admin/media';
import type { MockDb } from './mock/db';
import { ADMIN, as, fixture } from './mock/fixture';
import { coverPath } from './uploads';

const ORIGIN = 'http://x';

async function json(handler: any, db: MockDb, body: unknown, init: { origin?: string; type?: string } = {}) {
  const request = new Request(`${ORIGIN}/api`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': init.type ?? 'application/json', Origin: init.origin ?? ORIGIN },
  });
  const res: Response = await handler({ request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function form(handler: any, db: MockDb, fields: Record<string, string>) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.set(k, v));
  const request = new Request(`${ORIGIN}/api`, { method: 'POST', body });
  const res: Response = await handler({
    request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  });
  return new URL(res.headers.get('Location') ?? '/', ORIGIN).searchParams;
}

/** Signs, uploads and completes a cover like the browser does. */
async function uploadCover(db: MockDb, name = 'Portada Final.PNG') {
  const signed = await json(uploads, db, { kind: 'cover', media_id: 'm1', filename: name, content_type: 'image/png', size: 10 });
  expect(signed.status).toBe(200);
  const token = new URL(signed.body.uploadUrl, ORIGIN).searchParams.get('token')!;
  expect(db.storage.acceptUpload(token, new Uint8Array(10), 'image/png')).toBeNull();
  return json(covers, db, { action: 'complete', media_id: 'm1', path: signed.body.path });
}

describe('cover paths', () => {
  it('builds a safe path inside the title folder', () => {
    expect(coverPath('asm', 'Portada Final.PNG', 123)).toBe('asm/cover-123.png');
    expect(coverPath('asm', '../../etc/passwd', 1)).toBe('asm/cover-1.bin');
  });
});

describe('POST /api/admin/uploads (cover)', () => {
  it('returns a signed upload target for an image', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'cover', media_id: 'm1', filename: 'a.jpg', content_type: 'image/jpeg', size: 1000 });
    expect(status).toBe(200);
    expect(body.uploadUrl).toContain('/api/mock-storage/upload?token=');
    expect(body.path).toMatch(/^asm\/cover-\d+\.jpg$/);
    expect(body.headers['Content-Type']).toBe('image/jpeg');
  });

  it.each([
    [{ content_type: 'application/pdf', filename: 'a.pdf', size: 10 }, 'imagen'],
    [{ content_type: 'image/png', filename: 'a.png', size: 6 * 1024 * 1024 }, '5 MB'],
  ])('rejects %o', async (file, message) => {
    const { status, body } = await json(uploads, fixture(), { kind: 'cover', media_id: 'm1', ...file });
    expect(status).toBe(400);
    expect(body.error).toContain(message);
  });

  it('rejects requests that are not JSON or come from another origin', async () => {
    const payload = { kind: 'cover', media_id: 'm1', filename: 'a.png', content_type: 'image/png', size: 1 };
    expect((await json(uploads, fixture(), payload, { type: 'text/plain' })).status).toBe(415);
    expect((await json(uploads, fixture(), payload, { origin: 'http://evil.com' })).status).toBe(403);
  });

  it('404s for an unknown title', async () => {
    const { status } = await json(uploads, fixture(), { kind: 'cover', media_id: 'nope', filename: 'a.png', content_type: 'image/png', size: 1 });
    expect(status).toBe(404);
  });
});

describe('POST /api/admin/covers', () => {
  it('complete sets the public url and replaces the previous uploaded cover', async () => {
    const db = fixture();
    const first = await uploadCover(db);
    expect(first.status).toBe(200);
    const firstUrl = db.tables.media.find((m) => m.id === 'm1')!.cover_url;
    expect(firstUrl).toMatch(/^\/api\/mock-storage\/object\?bucket=covers&path=asm%2Fcover-\d+\.png$/);
    const firstPath = new URL(firstUrl, ORIGIN).searchParams.get('path')!;

    await new Promise((r) => setTimeout(r, 2));
    await uploadCover(db, 'otra.png');
    expect(db.tables.media.find((m) => m.id === 'm1')!.cover_url).not.toBe(firstUrl);
    expect(db.storage.read('covers', firstPath)).toBeNull();
  });

  it('complete refuses a path outside the title folder or that was never uploaded', async () => {
    const db = fixture();
    expect((await json(covers, db, { action: 'complete', media_id: 'm1', path: 'ff/cover-1.png' })).status).toBe(400);
    expect((await json(covers, db, { action: 'complete', media_id: 'm1', path: 'asm/cover-1.png' })).status).toBe(400);
  });

  it('remove clears the cover and deletes the file', async () => {
    const db = fixture();
    await uploadCover(db);
    const path = new URL(db.tables.media.find((m) => m.id === 'm1')!.cover_url, ORIGIN).searchParams.get('path')!;
    expect((await json(covers, db, { action: 'remove', media_id: 'm1' })).status).toBe(200);
    expect(db.tables.media.find((m) => m.id === 'm1')!.cover_url).toBeNull();
    expect(db.storage.read('covers', path)).toBeNull();
  });

  it('link accepts only https image links', async () => {
    const db = fixture();
    expect((await json(covers, db, { action: 'link', media_id: 'm1', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await json(covers, db, { action: 'link', media_id: 'm1', url: 'https://img.example.com/a.jpg' })).status).toBe(200);
    expect(db.tables.media.find((m) => m.id === 'm1')!.cover_url).toBe('https://img.example.com/a.jpg');
  });
});

describe('POST /api/admin/media update', () => {
  it('saving the data form keeps the uploaded cover', async () => {
    const db = fixture();
    await uploadCover(db);
    const cover = db.tables.media.find((m) => m.id === 'm1')!.cover_url;
    const params = await form(media, db, { action: 'update', id: 'm1', title: 'Spider-Man', slug: 'asm', kind: 'comic' });
    expect(params.get('ok')).toBe('Guardado.');
    expect(db.tables.media.find((m) => m.id === 'm1')!.cover_url).toBe(cover);
  });
});
