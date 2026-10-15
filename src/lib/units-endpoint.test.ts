import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/admin/units';
import type { MockDb } from '../test/mock/db';
import { ADMIN, as, fixture } from '../test/mock/fixture';

async function post(fields: Record<string, string>, db: MockDb = fixture()) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.set(k, v));
  const res = await POST({
    request: new Request('http://x/api/admin/units', { method: 'POST', body }),
    locals: { supabase: as(db, ADMIN) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as any);
  const params = new URL((res as Response).headers.get('Location') ?? '', 'http://x').searchParams;
  return { db, ok: params.get('ok'), error: params.get('error') };
}

describe('POST /api/admin/units', () => {
  it.each<Record<string, string>>([
    { action: 'add_range', prefix: 'FF', from: '2', to: '3', format: 'issue' },
    { action: 'add_one', label: 'Spider-Man Annual #1', short: 'A1' },
    { action: 'clear' },
  ])('ignores the removed action $action', async (fields) => {
    const before = fixture();
    const { db, ok, error } = await post({ media_id: 'm1', ...fields });
    expect({ ok, error }).toEqual({ ok: null, error: null });
    expect(db.tables.units).toHaveLength(before.tables.units.length);
    expect(db.tables.media_units).toHaveLength(before.tables.media_units.length);
  });

  /** Stores bytes at `path` in the content bucket, like a finished upload. */
  const store = (db: MockDb, path: string) => db.storage.acceptUpload(db.storage.issueUploadToken('content', path), new Uint8Array(3), 'image/jpeg');

  it('remove deletes a unit only this title has, with its single file', async () => {
    const db = fixture();
    Object.assign(db.tables.units.find((u) => u.id === 'u1')!, { file_path: 'asm/00001-1.cbz', file_format: 'cbz', file_size: 3 });
    store(db, 'asm/00001-1.cbz');
    const { ok } = await post({ media_id: 'm1', action: 'remove', unit_id: 'u1' }, db);
    expect(ok).toBe('Episodio borrado.');
    expect(db.tables.media_units.some((r) => r.unit_id === 'u1')).toBe(false);
    expect(db.tables.units.some((u) => u.id === 'u1')).toBe(false);
    expect(db.storage.read('content', 'asm/00001-1.cbz')).toBeNull();
  });

  it('remove deletes every page of a paged unit', async () => {
    const db = fixture();
    Object.assign(db.tables.units.find((u) => u.id === 'u1')!, { file_path: 'asm/00001-1/', pages: ['001.jpg', '002.jpg'], file_format: 'cbz' });
    ['001.jpg', '002.jpg'].forEach((p) => store(db, `asm/00001-1/${p}`));
    await post({ media_id: 'm1', action: 'remove', unit_id: 'u1' }, db);
    expect(db.storage.read('content', 'asm/00001-1/001.jpg')).toBeNull();
    expect(db.storage.read('content', 'asm/00001-1/002.jpg')).toBeNull();
    expect(db.tables.units.some((u) => u.id === 'u1')).toBe(false);
  });

  it('remove only unlinks a unit that another title still has, keeping its file', async () => {
    const db = fixture();
    db.tables.media_units.push({ media_id: 'm1', unit_id: 'u3', short: '9', group_name: null, position: 9 });
    Object.assign(db.tables.units.find((u) => u.id === 'u3')!, { file_path: 'ff/00001-1.cbz', file_format: 'cbz' });
    store(db, 'ff/00001-1.cbz');
    const { ok } = await post({ media_id: 'm1', action: 'remove', unit_id: 'u3' }, db);
    expect(ok).toBe('Se quitó de este título. Sigue en otros títulos con su archivo.');
    expect(db.tables.media_units.some((r) => r.media_id === 'm1' && r.unit_id === 'u3')).toBe(false);
    expect(db.tables.media_units.some((r) => r.media_id === 'm2' && r.unit_id === 'u3')).toBe(true);
    expect(db.tables.units.find((u) => u.id === 'u3')!.file_path).toBe('ff/00001-1.cbz');
    expect(db.storage.read('content', 'ff/00001-1.cbz')).not.toBeNull();
  });

  it.each([['', 'Episodio inválido.'], ['not-a-uuid', 'Ese episodio no está en este título.']])('remove with unit id %j answers %j and touches nothing', async (unit_id, message) => {
    const db = fixture();
    const before = [db.tables.media_units.length, db.tables.units.length];
    const { error } = await post({ media_id: 'm1', action: 'remove', unit_id }, db);
    expect(error).toBe(message);
    expect([db.tables.media_units.length, db.tables.units.length]).toEqual(before);
  });

  it('remove ignores a unit that is not in the title', async () => {
    const db = fixture();
    const { error } = await post({ media_id: 'm1', action: 'remove', unit_id: 'u3' }, db);
    expect(error).toBe('Ese episodio no está en este título.');
    expect(db.tables.units.some((u) => u.id === 'u3')).toBe(true);
  });
});
