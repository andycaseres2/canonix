import { describe, expect, it } from 'vitest';
import { POST as uploads } from '../pages/api/admin/uploads';
import { POST as episodes } from '../pages/api/admin/episodes';
import type { MockDb, Row } from '../test/mock/db';
import { ADMIN, as, fixture } from '../test/mock/fixture';
import { UNIT_PICK_EXTENSIONS, UNIT_FORMAT_LIST, detectNumber, parseUnitLabel, unitFileMeta, unitLabel } from './uploads';

const ORIGIN = 'http://x';

async function json(handler: any, db: MockDb, body: unknown) {
  const request = new Request(`${ORIGIN}/api`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: ORIGIN } });
  const res: Response = await handler({ request, url: new URL(request.url), locals: { supabase: as(db, ADMIN) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const unitsOf = (db: MockDb, mediaId: string) =>
  db.tables.media_units.filter((mu) => mu.media_id === mediaId).map((mu): Row => ({ ...mu, unit: db.tables.units.find((u) => u.id === mu.unit_id)! }));

describe('detectNumber', () => {
  it.each([
    ['Amazing Spider-Man 005.cbz', 5],
    ['Amazing Spider-Man (1963) #012.cbr', 12],
    ['Uncanny X-Men 129 (1980).pdf', 129],
    ['[Scans] Naruto - 012 [ES].cbz', 12],
    ['Naruto Shippuden Capitulo 45.pdf', 45],
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
  it('lets the admin pick CBZ, CBR or PDF files, which the browser splits into pages', () => {
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

const pageList = (n: number, ext = 'jpg') => Array.from({ length: n }, (_, i) => ({ name: `${String(i + 1).padStart(3, '0')}.${ext}`, content_type: `image/${ext === 'jpg' ? 'jpeg' : ext}`, size: 3 }));

/** Sign, upload and register a comic split into pages, the way the admin page does. `skip` leaves pages out of the upload. */
async function uploadPages(db: MockDb, media_id: string, number: number, count: number, skip: string[] = [], source = 'cbz', extra: { group?: string; series?: string } = {}) {
  const pages = pageList(count);
  const signed = await json(uploads, db, { kind: 'unit-pages', media_id, number, source, pages, series: extra.series });
  if (signed.status !== 200) return { signed, done: signed };
  for (const t of signed.body.targets) {
    if (skip.includes(t.name)) continue;
    const token = new URL(t.uploadUrl, ORIGIN).searchParams.get('token')!;
    expect(db.storage.acceptUpload(token, new Uint8Array(3), t.headers['Content-Type'])).toBeNull();
  }
  const done = await json(episodes, db, { action: 'complete', media_id, number, folder: signed.body.folder, pages: pages.map((p) => p.name), source, ...extra });
  return { signed, done };
}

/** Puts a file in content storage the way an older single-file upload left it. */
const storeOld = (db: MockDb, path: string) => db.storage.acceptUpload(db.storage.issueUploadToken('content', path), new Uint8Array(3), 'application/pdf');

describe('POST /api/admin/uploads', () => {
  it('refuses the old single-file upload, since every unit is stored by pages', async () => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit', media_id: 'm1', number: 5, filename: 'ASM 005.cbz', content_type: '', size: 10 });
    expect(status).toBe(400);
    expect(body.error).toBe('Tipo de subida desconocido.');
  });
});

describe('POST /api/admin/episodes', () => {
  it('registers each uploaded file as a unit of the title, so the count follows the files', async () => {
    const db = fixture();
    const before = unitsOf(db, 'm3').length;
    expect((await uploadPages(db, 'm3', 2, 1)).done.status).toBe(200);
    expect((await uploadPages(db, 'm3', 3, 2, [], 'pdf', { group: 'Tomo 1' })).done.status).toBe(200);
    const rows = unitsOf(db, 'm3');
    expect(rows).toHaveLength(before + 2);
    const ep3 = rows.find((r) => r.short === '3')!;
    expect(ep3).toMatchObject({ group_name: 'Tomo 1', unit: { label: 'Naruto #3', file_format: 'pdf', file_size: 6 } });
    expect(ep3.unit.file_path).toMatch(/^naruto\/00003-\d+\/$/);
    expect(ep3.position).toBeGreaterThan(rows.find((r) => r.short === '2')!.position);
  });

  it('attaches the pages to a unit that already exists with that label, without duplicating it', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u1')!.label = 'Spider-Man #1';
    expect((await uploadPages(db, 'm1', 1, 1)).done.status).toBe(200);
    expect(unitsOf(db, 'm1')).toHaveLength(2);
    expect(db.tables.units.find((u) => u.id === 'u1')!).toMatchObject({ file_format: 'cbz', pages: ['001.jpg'] });
  });

  it('with a series name the pages join the existing unit of that series', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u3')!.label = 'Batman #404';
    db.tables.media_units.push({ media_id: 'm1', unit_id: 'u3', short: '404', group_name: null, position: 3 });
    const { signed, done } = await uploadPages(db, 'm1', 404, 1, [], 'cbz', { series: 'Batman' });
    expect(signed.body.label).toBe('Batman #404');
    expect(signed.body.replaces).toBe(false);
    expect(done.status).toBe(200);
    expect(unitsOf(db, 'm1').filter((r) => r.short === '404')).toHaveLength(1);
    expect(db.tables.units.find((u) => u.id === 'u3')!.pages).toEqual(['001.jpg']);
  });

  it('refuses to complete an upload without its folder of pages and creates no unit', async () => {
    const db = fixture();
    const units = db.tables.units.length;
    for (const body of [{ path: 'asm/00001-1.cbz' }, {}]) {
      expect(await json(episodes, db, { action: 'complete', media_id: 'm1', number: 1, ...body })).toEqual({ status: 400, body: { error: 'Faltan las páginas subidas.' } });
    }
    expect(db.tables.units).toHaveLength(units);
  });

  it('remove_file clears an old single-file unit and deletes its file from storage', async () => {
    const db = fixture();
    const unit = Object.assign(db.tables.units.find((u) => u.id === 'u1')!, { file_path: 'asm/00001-1.pdf', file_format: 'pdf', file_size: 3, pages: null });
    expect(storeOld(db, 'asm/00001-1.pdf')).toBeNull();
    expect((await json(episodes, db, { action: 'remove_file', unit_id: 'u1' })).status).toBe(200);
    expect(unit).toMatchObject({ file_path: null, file_format: null, file_size: null });
    expect(db.storage.read('content', 'asm/00001-1.pdf')).toBeNull();
  });
});

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

  it.each([-1, 1.5])('rejects the number %s', async (number) => {
    const { status, body } = await json(uploads, fixture(), { kind: 'unit-pages', media_id: 'm1', number, source: 'cbz', pages: pageList(1) });
    expect(status).toBe(400);
    expect(body.error).toContain('número');
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

  it('names the units of a title that comes in volumes "- Tomo n"', async () => {
    const db = fixture();
    db.tables.media.find((m) => m.id === 'm3')!.unit_type = 'tomo';
    expect((await uploadPages(db, 'm3', 2, 1)).done.body).toMatchObject({ ok: true, label: 'Naruto - Tomo 2' });
    const { signed, done } = await uploadPages(db, 'm3', 3, 1);
    expect(signed.body.label).toBe('Naruto - Tomo 3');
    expect(done.body).toMatchObject({ ok: true, label: 'Naruto - Tomo 3' });
    expect(unitsOf(db, 'm3').map((r) => r.unit.label)).toEqual(['Naruto #1', 'Naruto - Tomo 2', 'Naruto - Tomo 3']);
  });

  it('calls a bad number by the title\'s word', async () => {
    const db = fixture();
    db.tables.media.find((m) => m.id === 'm3')!.unit_type = 'tomo';
    expect((await json(episodes, db, { action: 'complete', media_id: 'm3', number: -1, folder: 'x' })).body.error).toBe('Tomo inválido.');
    expect((await json(episodes, db, { action: 'complete', media_id: 'm1', number: -1, folder: 'x' })).body.error).toBe('Episodio inválido.');
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

  it('replacing an old single file with pages (and pages with pages) deletes what was stored before', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u1')!.label = 'Spider-Man #7';
    Object.assign(db.tables.units.find((u) => u.id === 'u1')!, { file_path: 'asm/00007-1.cbz', file_format: 'cbz', file_size: 3, pages: null });
    expect(storeOld(db, 'asm/00007-1.cbz')).toBeNull();
    const unit = () => db.tables.units.find((u) => u.label === 'Spider-Man #7')!;
    const first = await uploadPages(db, 'm1', 7, 2);
    expect(first.signed.body.replaces).toBe(true);
    expect(db.storage.read('content', 'asm/00007-1.cbz')).toBeNull();
    expect(unit().pages).toEqual(['001.jpg', '002.jpg']);
    await new Promise((r) => setTimeout(r, 2));
    await uploadPages(db, 'm1', 7, 1);
    expect(db.storage.read('content', `${first.signed.body.folder}001.jpg`)).toBeNull();
    expect(db.storage.read('content', `${first.signed.body.folder}002.jpg`)).toBeNull();
    expect(unit().pages).toEqual(['001.jpg']);
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

describe('POST /api/admin/episodes (discard_folder)', () => {
  /** Signs `count` pages and uploads only the first `uploaded`, like an upload that failed halfway. */
  async function partial(db: MockDb, media_id: string, number: number, count: number, uploaded: number) {
    const signed = await json(uploads, db, { kind: 'unit-pages', media_id, number, source: 'cbz', pages: pageList(count) });
    for (const t of signed.body.targets.slice(0, uploaded)) {
      const token = new URL(t.uploadUrl, ORIGIN).searchParams.get('token')!;
      expect(db.storage.acceptUpload(token, new Uint8Array(3), t.headers['Content-Type'])).toBeNull();
    }
    return signed.body.folder as string;
  }
  const stored = (db: MockDb, folder: string, n: number) =>
    pageList(n).map((p) => db.storage.read('content', `${folder}${p.name}`) !== null);

  it('deletes the pages of the title\'s own folder that no unit uses', async () => {
    const db = fixture();
    const folder = await partial(db, 'm1', 8, 3, 2);
    await new Promise((r) => setTimeout(r, 2));
    const other = await partial(db, 'm1', 8, 1, 1);
    expect(stored(db, folder, 2)).toEqual([true, true]);
    const { status, body } = await json(episodes, db, { action: 'discard_folder', media_id: 'm1', number: 8, folder });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, removed: 2 });
    expect(stored(db, folder, 3)).toEqual([false, false, false]);
    expect(stored(db, other, 1)).toEqual([true]);
    expect(db.tables.units.some((u) => u.label === 'Spider-Man #8')).toBe(false);
  });

  it('refuses a folder a unit points at and leaves its pages', async () => {
    const db = fixture();
    const { signed } = await uploadPages(db, 'm1', 9, 2);
    const { status, body } = await json(episodes, db, { action: 'discard_folder', media_id: 'm1', number: 9, folder: signed.body.folder });
    expect(status).toBe(409);
    expect(body.error).toBe('Esa carpeta está en uso.');
    expect(stored(db, signed.body.folder, 2)).toEqual([true, true]);
    expect(db.tables.units.find((u) => u.label === 'Spider-Man #9')).toMatchObject({ file_path: signed.body.folder, pages: ['001.jpg', '002.jpg'] });
  });

  it.each([
    ['another title', (f: string) => f],
    ['a path that climbs out', (f: string) => `asm/00008-1/../../${f}`],
    ['the folder without its trailing slash', (f: string) => f.replace(/\/$/, '')],
  ])('refuses %s and leaves its pages', async (_, make) => {
    const db = fixture();
    const foreign = await partial(db, 'm2', 8, 2, 2);
    const { status, body } = await json(episodes, db, { action: 'discard_folder', media_id: 'm1', number: 8, folder: make(foreign) });
    expect(status).toBe(400);
    expect(body.error).toBe('Carpeta no válida.');
    expect(stored(db, foreign, 2)).toEqual([true, true]);
  });

  it('refuses a folder of another number of the same title', async () => {
    const db = fixture();
    const folder = await partial(db, 'm1', 8, 1, 1);
    expect((await json(episodes, db, { action: 'discard_folder', media_id: 'm1', number: 9, folder })).body).toEqual({ error: 'Carpeta no válida.' });
    expect(stored(db, folder, 1)).toEqual([true]);
  });
});

describe('parseUnitLabel', () => {
  it('reads back the labels unitLabel builds and nothing else', () => {
    expect(parseUnitLabel('Batman #404')).toEqual({ series: 'Batman', n: 404, type: 'episodio' });
    expect(parseUnitLabel('Berserk - Tomo 3')).toEqual({ series: 'Berserk', n: 3, type: 'tomo' });
    expect(parseUnitLabel('X-Men - Tomo 2 #5')).toEqual({ series: 'X-Men - Tomo 2', n: 5, type: 'episodio' });
    expect(parseUnitLabel('ASM Annual')).toBeNull();
    expect(parseUnitLabel('Naruto - Episodio 4')).toBeNull();
  });
});
