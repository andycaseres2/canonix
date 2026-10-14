import { describe, expect, it } from 'vitest';
import type { MockDb } from '../test/mock/db';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';
import { getReader } from './reader';

/** Spider-Man (free) #1 and #2 and Naruto (premium) episode 1 get files; FF #1 has none. */
function withFiles() {
  const db = fixture();
  const file = (id: string, file_path: string, file_format: string) => Object.assign(db.tables.units.find((u) => u.id === id)!, { file_path, file_format, file_size: 1000 });
  file('u1', 'asm/00001-1.cbz', 'cbz');
  file('u2', 'asm/00002-1.pdf', 'pdf');
  file('u4', 'naruto/00001-1.mp4', 'mp4');
  return db;
}

const viewerOf = (db: MockDb, uid: string | null) => {
  const p = uid ? db.profile(uid) : null;
  return p ? { id: uid!, plan: p.plan, role: p.role } : null;
};
const read = (db: MockDb, uid: string | null, slug: string, n: string) => getReader(as(db, uid), slug, n, viewerOf(db, uid));

describe('getReader', () => {
  it('signs the file for a signed-in reader of a free title, with its neighbours', async () => {
    const r = await read(withFiles(), READER, 'asm', '1');
    expect(r).toMatchObject({ state: 'ready', format: 'cbz', unit: { short: '1', label: 'ASM #1' }, prev: null, next: { short: '2' } });
    expect(r!.url).toMatch(/^https:\/\/mock\.supabase\.co\/storage\/v1\/object\/sign\/content\/asm\/00001-1\.cbz\?token=/);
    expect((await read(withFiles(), READER, 'asm', '2'))).toMatchObject({ state: 'ready', format: 'pdf', prev: { short: '1' }, next: null });
  });

  it('asks anonymous visitors to log in and gives them no url', async () => {
    expect(await read(withFiles(), null, 'asm', '1')).toMatchObject({ state: 'login', url: null });
  });

  it('locks a premium title for free users and opens it for premium users and admins', async () => {
    expect(await read(withFiles(), READER, 'naruto', '1')).toMatchObject({ state: 'locked', url: null, media: { requires_plan: 'premium' } });
    expect(await read(withFiles(), PREMIUM, 'naruto', '1')).toMatchObject({ state: 'ready', format: 'mp4' });
    expect(await read(withFiles(), ADMIN, 'naruto', '1')).toMatchObject({ state: 'ready' });
  });

  it('reports a unit without a file and returns null for unknown titles or numbers', async () => {
    expect(await read(withFiles(), READER, 'ff', '1')).toMatchObject({ state: 'nofile', url: null });
    expect(await read(withFiles(), READER, 'nope', '1')).toBeNull();
    expect(await read(withFiles(), READER, 'asm', '99')).toBeNull();
  });

  it('skips units without a file when linking the previous and next ones', async () => {
    const db = withFiles();
    db.tables.units.find((u) => u.id === 'u2')!.file_path = null;
    expect(await read(db, READER, 'asm', '1')).toMatchObject({ next: null });
  });
});
