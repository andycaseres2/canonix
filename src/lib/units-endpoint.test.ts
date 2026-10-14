import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/admin/units';
import { ADMIN, as, fixture } from '../test/mock/fixture';

async function post(fields: Record<string, string>) {
  const db = fixture();
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
  ])('no longer creates units without a file ($action)', async (fields) => {
    const before = fixture();
    const { db, ok, error } = await post({ media_id: 'm1', ...fields });
    expect({ ok, error }).toEqual({ ok: null, error: null });
    expect(db.tables.units).toHaveLength(before.tables.units.length);
    expect(db.tables.media_units).toHaveLength(before.tables.media_units.length);
  });

  it('remove unlinks one unit from the title', async () => {
    const unit = fixture().tables.media_units.find((r) => r.media_id === 'm1')!;
    const { db } = await post({ media_id: 'm1', action: 'remove', unit_id: unit.unit_id });
    expect(db.tables.media_units.some((r) => r.media_id === 'm1' && r.unit_id === unit.unit_id)).toBe(false);
    expect(db.tables.units.some((u) => u.id === unit.unit_id)).toBe(true);
  });

  it('clear unlinks every unit from the title', async () => {
    const { db, ok } = await post({ media_id: 'm1', action: 'clear' });
    expect(ok).toBe('Se quitaron todos.');
    expect(db.tables.media_units.some((r) => r.media_id === 'm1')).toBe(false);
  });
});
