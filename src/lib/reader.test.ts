import { describe, expect, it, vi } from 'vitest';
import type { MockDb } from '../test/mock/db';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';
import { PAGE_BATCH, getReader, getTitleUnits } from './reader';

/** Spider-Man (free) #1 and #2 and Naruto (premium) #1 are stored by pages; FF #1 has no file. */
function withFiles() {
  const db = fixture();
  const paged = (id: string, file_path: string, pages: string[], file_format = 'cbz') =>
    Object.assign(db.tables.units.find((u) => u.id === id)!, { file_path, pages, file_format, file_size: 1000 });
  paged('u1', 'asm/00001-1/', ['001.jpg', '002.png'], 'cbr');
  paged('u2', 'asm/00002-1/', ['001.webp'], 'pdf');
  paged('u4', 'naruto/00001-1/', ['001.jpg']);
  return db;
}

const viewerOf = (db: MockDb, uid: string | null) => {
  const p = uid ? db.profile(uid) : null;
  return p ? { id: uid!, plan: p.plan, role: p.role } : null;
};
const read = (db: MockDb, uid: string | null, slug: string, n: string) => getReader(as(db, uid), slug, n, viewerOf(db, uid));

describe('getReader', () => {
  it('signs every page, in order, for a signed-in reader of a free title, with its neighbours', async () => {
    const r = await read(withFiles(), READER, 'asm', '1');
    expect(r).toMatchObject({ state: 'ready', unit: { short: '1', label: 'ASM #1' }, prev: null, next: { short: '2' }, pageCount: 2 });
    expect(r).not.toHaveProperty('url');
    expect(r!.pages).toHaveLength(2);
    expect(r!.pages![0]).toMatch(/^https:\/\/mock\.supabase\.co\/storage\/v1\/object\/sign\/content\/asm\/00001-1\/001\.jpg\?token=/);
    expect(r!.pages![1]).toMatch(/\/object\/sign\/content\/asm\/00001-1\/002\.png\?token=/);
    expect(await read(withFiles(), READER, 'asm', '2')).toMatchObject({ state: 'ready', prev: { short: '1' }, next: null, pageCount: 1 });
  });

  it('asks anonymous visitors to log in and gives them no pages', async () => {
    expect(await read(withFiles(), null, 'asm', '1')).toMatchObject({ state: 'login', pages: null });
  });

  it('locks a premium title for free users and opens it for premium users and admins', async () => {
    expect(await read(withFiles(), READER, 'naruto', '1')).toMatchObject({ state: 'locked', pages: null, media: { requires_plan: 'premium' } });
    expect((await read(withFiles(), PREMIUM, 'naruto', '1'))!.pages).toHaveLength(1);
    expect(await read(withFiles(), ADMIN, 'naruto', '1')).toMatchObject({ state: 'ready' });
  });

  it('reports a unit without a file and returns null for unknown titles or numbers', async () => {
    expect(await read(withFiles(), READER, 'ff', '1')).toMatchObject({ state: 'nofile', pages: null });
    expect(await read(withFiles(), READER, 'nope', '1')).toBeNull();
    expect(await read(withFiles(), READER, 'asm', '99')).toBeNull();
  });

  it('asks to upload again a unit stored as a single file, without signing anything', async () => {
    const db = withFiles();
    Object.assign(db.tables.units.find((u) => u.id === 'u2')!, { file_path: 'asm/00002-1.pdf', pages: null, file_format: 'pdf' });
    const signs = vi.spyOn(db.storage, 'issueReadToken');
    expect(await read(db, READER, 'asm', '2')).toMatchObject({ state: 'reupload', pages: null, pageCount: 0, prev: { short: '1' } });
    expect(await read(db, null, 'asm', '2')).toMatchObject({ state: 'login' });
    expect(signs).not.toHaveBeenCalled();
  });

  it('skips units without a file when linking the previous and next ones', async () => {
    const db = withFiles();
    db.tables.units.find((u) => u.id === 'u2')!.file_path = null;
    expect(await read(db, READER, 'asm', '1')).toMatchObject({ next: null });
  });

  it('signs only the first batch of a long volume and says how many pages it has', async () => {
    const db = withFiles();
    const names = Array.from({ length: 45 }, (_, i) => `${String(i + 1).padStart(3, '0')}.jpg`);
    Object.assign(db.tables.units.find((u) => u.id === 'u1')!, { pages: names });
    const signs = vi.spyOn(db.storage, 'issueReadToken');
    const r = await read(db, READER, 'asm', '1');
    expect(r).toMatchObject({ state: 'ready', pageCount: 45 });
    expect(r!.pages).toHaveLength(PAGE_BATCH);
    expect(r!.pages![PAGE_BATCH - 1]).toMatch(/\/asm\/00001-1\/020\.jpg\?token=/);
    expect(signs).toHaveBeenCalledTimes(PAGE_BATCH);
  });
});

describe('getTitleUnits', () => {
  it('lists a title\'s units in order with their file format and size', async () => {
    const units = await getTitleUnits(as(withFiles(), READER), 'm1');
    expect(units.map((u) => [u.short, u.label, u.file_format, u.file_size])).toEqual([['1', 'ASM #1', 'cbr', 1000], ['2', 'ASM #2', 'pdf', 1000]]);
    expect(units[0]).not.toHaveProperty('file_path');
    expect(units[0]).toMatchObject({ id: 'u1', has_file: true, group: null });
  });

  it('marks units without a file', async () => {
    expect(await getTitleUnits(as(withFiles(), null), 'm2')).toMatchObject([{ short: '1', has_file: false, file_format: null }]);
  });
});
