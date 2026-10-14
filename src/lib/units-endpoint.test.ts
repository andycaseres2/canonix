import { describe, expect, it } from 'vitest';
import { POST } from '../pages/api/admin/units';
import { ADMIN, as, fixture } from './mock/fixture';

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
  it.each(['5', '#12', 'E1', '  7 ', '1-3'])('add_one rejects the generic label %j', async (label) => {
    const { db, error } = await post({ media_id: 'm1', action: 'add_one', label });
    expect(error).toContain('Usa un nombre que identifique el número');
    expect(db.tables.units.some((u) => u.label === label.trim())).toBe(false);
  });

  it('add_one accepts a descriptive label', async () => {
    const { db, ok } = await post({ media_id: 'm1', action: 'add_one', label: 'Spider-Man Annual #1', short: 'A1' });
    expect(ok).toBe('Agregado.');
    expect(db.tables.media_units.some((r) => r.media_id === 'm1' && r.short === 'A1')).toBe(true);
  });

  it('add_range keeps building labels from the prefix', async () => {
    const { db, ok } = await post({ media_id: 'm2', action: 'add_range', prefix: 'FF', from: '2', to: '3', format: 'issue' });
    expect(ok).toBe('Se agregaron 2.');
    expect(db.tables.units.filter((u) => /^FF #[23]$/.test(u.label))).toHaveLength(2);
  });
});
