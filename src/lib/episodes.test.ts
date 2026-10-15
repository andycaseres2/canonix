import { describe, expect, it } from 'vitest';
import { POST as uploads } from '../pages/api/admin/uploads';
import { POST as episodes } from '../pages/api/admin/episodes';
import type { MockDb, Row } from '../test/mock/db';
import { ADMIN, as, fixture } from '../test/mock/fixture';
import { UNIT_FORMATS, UNIT_PICK_EXTENSIONS, UNIT_FORMAT_LIST, detectNumber, unitFileMeta, unitLabel } from './uploads';

const ORIGIN = 'http://x';

async function json(handler: any, db: MockDb, body: unknown) {
  const request = new Request(`${ORIGIN}/api`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: ORIGIN } });
  const res: Response = await handler({ request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Sign, upload and register one file the way the admin page does. */
async function uploadUnit(db: MockDb, media_id: string, number: number, filename: string, group: string | null = null, series?: string) {
  const signed = await json(uploads, db, { kind: 'unit', media_id, number, filename, content_type: '', size: 4, series });
  if (signed.status !== 200) return signed;
  const token = new URL(signed.body.uploadUrl, ORIGIN).searchParams.get('token')!;
  expect(db.storage.acceptUpload(token, new Uint8Array(4), signed.body.headers['Content-Type'])).toBeNull();
  return json(episodes, db, { action: 'complete', media_id, number, path: signed.body.path, group, series });
}

const unitsOf = (db: MockDb, mediaId: string) =>
  db.tables.media_units.filter((mu) => mu.media_id === mediaId).map((mu): Row => ({ ...mu, unit: db.tables.units.find((u) => u.id === mu.unit_id)! }));

describe('detectNumber', () => {
  it.each([
    ['Amazing Spider-Man 005.cbz', 5],
    ['Amazing Spider-Man (1963) #012.cbr', 12],
    ['Uncanny X-Men 129 (1980).pdf', 129],
    ['[SubGroup] Naruto - 012 [1080p][x264].mkv', 12],
    ['Naruto Shippuden Episodio 45 1080p.mp4', 45],
    ['One Piece Cap. 1050.cbz', 1050],
    ['Watchmen 1986.pdf', null],
    ['portada.cbz', null],
    ['2.cbz', 2],
    ['Berserk Tomo 05 - 2a edición.cbz', 5],
    ['Berserk Vol. 07 parte 2.pdf', 7],
    ['Berserk Volumen 9 v2.cbz', 9],
  ])('%s -> %s', (name, n) => {
    expect(detectNumber(name)).toBe(n);
  });
});

describe('unitFileMeta', () => {
  it('shows the format and size of a unit file', () => {
    expect(unitFileMeta({ file_path: 'ff/00001.cbz', file_format: 'cbz', file_size: 33_554_432 })).toBe('CBZ · 32.0 MB');
    expect(unitFileMeta({ file_path: 'ff/00002.pdf', file_format: 'pdf', file_size: 512_000 })).toBe('PDF · 500 KB');
    expect(unitFileMeta({ file_path: 'ff/00003.cbz', file_format: 'cbz', file_size: null })).toBe('CBZ');
  });

  it('says when a unit has no file', () => {
    expect(unitFileMeta({ file_path: null, file_format: null, file_size: null })).toBe('Sin archivo');
    expect(unitFileMeta(null)).toBe('Sin archivo');
  });
});

describe('unit formats', () => {
  it('stores comics and mangas only as CBZ or PDF, but lets the admin pick CBR files to convert', () => {
    expect(Object.keys(UNIT_FORMATS)).toEqual(['cbz', 'pdf']);
    expect(UNIT_PICK_EXTENSIONS).toEqual(['cbz', 'cbr', 'pdf']);
    expect(UNIT_FORMAT_LIST).toBe('CBZ, CBR o PDF');
  });
});

describe('unitLabel', () => {
  it('uses the series name when given, otherwise the title', () => {
    expect(unitLabel({ title: 'Batman: Year One', kind: 'comic' }, 404, 'Batman')).toBe('Batman #404');
    expect(unitLabel({ title: 'Batman: Year One', kind: 'comic' }, 404, '   ')).toBe('Batman: Year One #404');
  });

  it('uses #n for episodes of comics and mangas alike', () => {
    expect(unitLabel({ title: 'Spider-Man', kind: 'comic' }, 5)).toBe('Spider-Man #5');
    expect(unitLabel({ title: 'Naruto', kind: 'manga', unit_type: 'episodio' }, 3)).toBe('Naruto #3');
  });

  it('uses "- Tomo n" for titles that come in volumes', () => {
    expect(unitLabel({ title: 'Berserk', kind: 'manga', unit_type: 'tomo' }, 3)).toBe('Berserk - Tomo 3');
    expect(unitLabel({ title: 'Saga Deluxe', kind: 'comic', unit_type: 'tomo' }, 1, 'Saga')).toBe('Saga - Tomo 1');
  });
});

describe('POST /api/admin/uploads (unit)', () => {
  it('signs a comic file with its content type and label', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit', media_id: 'm1', number: 5, filename: 'ASM 005.CBZ', content_type: '', size: 10 });
    expect(status).toBe(200);
    expect(body.path).toMatch(/^asm\/00005-\d+\.cbz$/);
    expect(body.headers['Content-Type']).toBe('application/vnd.comicbook+zip');
    expect(body.label).toBe('Spider-Man #5');
  });

  it('signs a manga file with the comic formats', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit', media_id: 'm3', number: 2, filename: 'Naruto 002.pdf', content_type: '', size: 10 });
    expect(status).toBe(200);
    expect(body.path).toMatch(/^naruto\/00002-\d+\.pdf$/);
    expect(body.headers['Content-Type']).toBe('application/pdf');
    expect(body.label).toBe('Naruto #2');
  });

  it.each([
    ['m1', 'episodio.mp4', 1, 'Para un cómic sube archivos CBZ, CBR o PDF.'],
    ['m3', 'naruto.mp4', 1, 'Para un manga sube archivos CBZ, CBR o PDF.'],
    ['m3', 'naruto.cbr', 1, 'se convierten a CBZ'],
    ['m1', 'asm.cbr', 1, 'se convierten a CBZ'],
    ['m1', 'asm.cbz', -1, 'número'],
    ['m1', 'asm.cbz', 1.5, 'número'],
  ])('rejects %s %s #%s', async (media_id, filename, number, message) => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit', media_id, number, filename, content_type: '', size: 10 });
    expect(status).toBe(400);
    expect(body.error).toContain(message);
  });
});

describe('POST /api/admin/episodes', () => {
  it('registers each uploaded file as a unit of the title, so the count follows the files', async () => {
    const db = fixture();
    const before = unitsOf(db, 'm3').length;
    expect((await uploadUnit(db, 'm3', 2, 'Naruto 002.cbz')).status).toBe(200);
    expect((await uploadUnit(db, 'm3', 3, 'Naruto 003.pdf', 'Tomo 1')).status).toBe(200);
    const rows = unitsOf(db, 'm3');
    expect(rows).toHaveLength(before + 2);
    const ep3 = rows.find((r) => r.short === '3')!;
    expect(ep3).toMatchObject({ group_name: 'Tomo 1', unit: { label: 'Naruto #3', file_format: 'pdf', file_size: 4 } });
    expect(ep3.unit.file_path).toMatch(/^naruto\/00003-\d+\.pdf$/);
    expect(ep3.position).toBeGreaterThan(rows.find((r) => r.short === '2')!.position);
  });

  it('attaches the file to a unit that already exists with that label, without duplicating it', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u1')!.label = 'Spider-Man #1';
    expect((await uploadUnit(db, 'm1', 1, 'asm 1.cbz')).status).toBe(200);
    expect(unitsOf(db, 'm1')).toHaveLength(2);
    expect(db.tables.units.find((u) => u.id === 'u1')!.file_format).toBe('cbz');
  });

  it('with a series name the file joins the existing unit of that series', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u3')!.label = 'Batman #404';
    db.tables.media_units.push({ media_id: 'm1', unit_id: 'u3', short: '404', group_name: null, position: 3 });
    const signed = await json(uploads, db, { kind: 'unit', media_id: 'm1', number: 404, filename: 'b 404.cbz', content_type: '', size: 4, series: 'Batman' });
    expect(signed.body.label).toBe('Batman #404');
    expect(signed.body.replaces).toBe(false);
    expect((await uploadUnit(db, 'm1', 404, 'b 404.cbz', null, 'Batman')).status).toBe(200);
    expect(unitsOf(db, 'm1').filter((r) => r.short === '404')).toHaveLength(1);
    expect(db.tables.units.find((u) => u.id === 'u3')!.file_format).toBe('cbz');
  });

  it('a second upload for the same number replaces the file and deletes the old one', async () => {
    const db = fixture();
    await uploadUnit(db, 'm1', 7, 'asm 7.cbz');
    const unit = () => db.tables.units.find((u) => u.label === 'Spider-Man #7')!;
    const oldPath = unit().file_path;
    await new Promise((r) => setTimeout(r, 2));
    await uploadUnit(db, 'm1', 7, 'asm 7 v2.pdf');
    expect(unit().file_format).toBe('pdf');
    expect(unit().file_path).not.toBe(oldPath);
    expect(db.storage.read('content', oldPath)).toBeNull();
    expect(unitsOf(db, 'm1').filter((r) => r.unit.label === 'Spider-Man #7')).toHaveLength(1);
  });

  it('refuses a path that was not uploaded or belongs to another title', async () => {
    const db = fixture();
    expect((await json(episodes, db, { action: 'complete', media_id: 'm1', number: 1, path: 'asm/00001-1.cbz' })).status).toBe(400);
    expect((await json(episodes, db, { action: 'complete', media_id: 'm1', number: 1, path: 'ff/00001-1.cbz' })).status).toBe(400);
  });

  it('remove_file clears the unit file and deletes it from storage', async () => {
    const db = fixture();
    await uploadUnit(db, 'm1', 9, 'asm 9.cbz');
    const unit = db.tables.units.find((u) => u.label === 'Spider-Man #9')!;
    const path = unit.file_path;
    expect((await json(episodes, db, { action: 'remove_file', unit_id: unit.id })).status).toBe(200);
    expect(unit).toMatchObject({ file_path: null, file_format: null, file_size: null });
    expect(db.storage.read('content', path)).toBeNull();
  });
});

const pageList = (n: number, ext = 'jpg') => Array.from({ length: n }, (_, i) => ({ name: `${String(i + 1).padStart(3, '0')}.${ext}`, content_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`, size: 3 }));

/** Sign, upload and register a comic split into pages, the way the admin page does. `skip` leaves pages out of the upload. */
async function uploadPages(db: MockDb, media_id: string, number: number, count: number, skip: string[] = [], source = 'cbz') {
  const pages = pageList(count);
  const signed = await json(uploads, db, { kind: 'unit-pages', media_id, number, source, pages });
  if (signed.status !== 200) return { signed, done: signed };
  for (const t of signed.body.targets) {
    if (skip.includes(t.name)) continue;
    const token = new URL(t.uploadUrl, ORIGIN).searchParams.get('token')!;
    expect(db.storage.acceptUpload(token, new Uint8Array(3), t.headers['Content-Type'])).toBeNull();
  }
  const done = await json(episodes, db, { action: 'complete', media_id, number, folder: signed.body.folder, pages: pages.map((p) => p.name), source });
  return { signed, done };
}

describe('POST /api/admin/uploads (unit-pages)', () => {
  it('signs every page inside a new folder for the issue', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit-pages', media_id: 'm1', number: 5, source: 'cbr', pages: pageList(3) });
    expect(status).toBe(200);
    expect(body.folder).toMatch(/^asm\/00005-\d+\/$/);
    expect(body.label).toBe('Spider-Man #5');
    expect(body.targets.map((t: any) => [t.name, t.path, t.headers['Content-Type']])).toEqual(
      ['001.jpg', '002.jpg', '003.jpg'].map((n) => [n, `${body.folder}${n}`, 'image/jpeg']));
    expect(body.targets[0].uploadUrl).toContain(`/object/upload/sign/content/${body.folder}001.jpg?token=`);
  });

  it('signs the pages of a manga too', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit-pages', media_id: 'm3', number: 4, source: 'cbz', pages: pageList(2) });
    expect(status).toBe(200);
    expect(body.folder).toMatch(/^naruto\/00004-\d+\/$/);
    expect(body.label).toBe('Naruto #4');
  });

  it.each([
    ['m1', [], 'páginas'],
    ['m1', pageList(2001), '2000'],
    ['m1', [{ name: '001.txt', content_type: 'text/plain', size: 3 }], 'imagen'],
    ['m1', [{ name: '../001.jpg', content_type: 'image/jpeg', size: 3 }], 'imagen'],
    ['m1', [{ name: '001.jpg', content_type: 'image/jpeg', size: 51 * 1024 * 1024 }], '50 MB'],
    ['m1', [...pageList(1), ...pageList(1)], 'repetida'],
  ])('rejects %s with bad pages (%#)', async (media_id, pages, message) => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit-pages', media_id, number: 1, source: 'cbz', pages });
    expect(status).toBe(400);
    expect(body.error).toContain(message);
  });
});

describe('POST /api/admin/episodes (pages)', () => {
  it('registers the folder and its pages once every page is uploaded', async () => {
    const db = fixture();
    const { signed, done } = await uploadPages(db, 'm1', 8, 3);
    expect(done.status).toBe(200);
    const unit = db.tables.units.find((u) => u.label === 'Spider-Man #8')!;
    expect(unit).toMatchObject({ file_path: signed.body.folder, pages: ['001.jpg', '002.jpg', '003.jpg'], file_format: 'cbz', file_size: 9 });
    expect(unitsOf(db, 'm1').some((r) => r.unit_id === unit.id && r.short === '8')).toBe(true);
  });

  it('names the units of a title that comes in volumes "- Tomo n", single file or pages', async () => {
    const db = fixture();
    db.tables.media.find((m) => m.id === 'm3')!.unit_type = 'tomo';
    expect((await uploadUnit(db, 'm3', 2, 'Naruto Tomo 2.cbz')).body).toMatchObject({ ok: true, label: 'Naruto - Tomo 2' });
    const { signed, done } = await uploadPages(db, 'm3', 3, 1);
    expect(signed.body.label).toBe('Naruto - Tomo 3');
    expect(done.body).toMatchObject({ ok: true, label: 'Naruto - Tomo 3' });
    expect(unitsOf(db, 'm3').map((r) => r.unit.label)).toEqual(['Naruto #1', 'Naruto - Tomo 2', 'Naruto - Tomo 3']);
  });

  it('calls a bad number by the title\'s word', async () => {
    const db = fixture();
    db.tables.media.find((m) => m.id === 'm3')!.unit_type = 'tomo';
    expect((await json(episodes, db, { action: 'complete', media_id: 'm3', number: -1, path: 'x' })).body.error).toBe('Tomo inválido.');
    expect((await json(episodes, db, { action: 'complete', media_id: 'm1', number: -1, path: 'x' })).body.error).toBe('Episodio inválido.');
  });

  it('registers the pages of a manga', async () => {
    const db = fixture();
    const { signed, done } = await uploadPages(db, 'm3', 4, 2);
    expect(done.status).toBe(200);
    const unit = db.tables.units.find((u) => u.label === 'Naruto #4')!;
    expect(unit).toMatchObject({ file_path: signed.body.folder, pages: ['001.jpg', '002.jpg'], file_format: 'cbz' });
    expect(unitsOf(db, 'm3').some((r) => r.unit_id === unit.id && r.short === '4')).toBe(true);
  });

  it('refuses to register when a page is missing and leaves the unit untouched', async () => {
    const db = fixture();
    const { done } = await uploadPages(db, 'm1', 8, 3, ['002.jpg']);
    expect(done.status).toBe(400);
    expect(done.body.error).toContain('Faltan 1 página');
    expect(db.tables.units.some((u) => u.label === 'Spider-Man #8')).toBe(false);
  });

  it('refuses a folder of another title or number', async () => {
    const db = fixture();
    const body = { action: 'complete', media_id: 'm1', number: 8, pages: ['001.jpg'], source: 'cbz' };
    expect((await json(episodes, db, { ...body, folder: 'ff/00008-1/' })).status).toBe(400);
    expect((await json(episodes, db, { ...body, folder: 'asm/00009-1/' })).status).toBe(400);
  });

  it('replacing a single file with pages (and pages with pages) deletes what was stored before', async () => {
    const db = fixture();
    await uploadUnit(db, 'm1', 7, 'asm 7.cbz');
    const unit = () => db.tables.units.find((u) => u.label === 'Spider-Man #7')!;
    const single = unit().file_path;
    await new Promise((r) => setTimeout(r, 2));
    const first = await uploadPages(db, 'm1', 7, 2);
    expect(db.storage.read('content', single)).toBeNull();
    expect(unit().pages).toEqual(['001.jpg', '002.jpg']);
    await new Promise((r) => setTimeout(r, 2));
    await uploadPages(db, 'm1', 7, 1);
    expect(db.storage.read('content', `${first.signed.body.folder}001.jpg`)).toBeNull();
    expect(db.storage.read('content', `${first.signed.body.folder}002.jpg`)).toBeNull();
    expect(unit().pages).toEqual(['001.jpg']);
    await new Promise((r) => setTimeout(r, 2));
    await uploadUnit(db, 'm1', 7, 'asm 7.pdf');
    expect(unit()).toMatchObject({ file_format: 'pdf', pages: null });
  });

  it('remove_file deletes every page of a paged unit', async () => {
    const db = fixture();
    const { signed } = await uploadPages(db, 'm1', 9, 2);
    const unit = db.tables.units.find((u) => u.label === 'Spider-Man #9')!;
    expect((await json(episodes, db, { action: 'remove_file', unit_id: unit.id })).status).toBe(200);
    expect(unit).toMatchObject({ file_path: null, pages: null, file_format: null, file_size: null });
    expect(db.storage.read('content', `${signed.body.folder}001.jpg`)).toBeNull();
    expect(db.storage.read('content', `${signed.body.folder}002.jpg`)).toBeNull();
  });
});

describe('pages converted from a PDF', () => {
  it('records a PDF split into pages with its source format', async () => {
    const db = fixture();
    const { done } = await uploadPages(db, 'm1', 7, 3, [], 'pdf');
    expect(done.status).toBe(200);
    const unit = db.tables.units.find((u) => u.label === 'Spider-Man #7')!;
    expect(unit).toMatchObject({ file_format: 'pdf', pages: ['001.jpg', '002.jpg', '003.jpg'] });
    expect(unit.file_path).toMatch(/^asm\/00007-\d+\/$/);
  });

  it('still records an unknown source as CBZ', async () => {
    const db = fixture();
    await uploadPages(db, 'm1', 8, 2, [], 'zip');
    expect(db.tables.units.find((u) => u.label === 'Spider-Man #8')).toMatchObject({ file_format: 'cbz' });
  });
});
