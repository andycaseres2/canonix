import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRoute, getRouteUnitMap } from './data';
import { PREMIUM, READER, as, fixture } from './mock/fixture';

/** Wraps a client and records every table queried and rpc called. */
function spy(sb: SupabaseClient) {
  const calls: string[] = [];
  const wrapped = new Proxy(sb, {
    get(target, prop, receiver) {
      if (prop === 'from') return (t: string) => { calls.push(`from:${t}`); return target.from(t); };
      if (prop === 'rpc') return (n: string, ...rest: any[]) => { calls.push(`rpc:${n}`); return (target.rpc as any)(n, ...rest); };
      return Reflect.get(target, prop, receiver);
    },
  });
  return { sb: wrapped, calls };
}

describe('getRouteUnitMap', () => {
  it('uses a fixed number of queries no matter how many routes exist', async () => {
    const db = fixture();
    for (let k = 0; k < 10; k++) db.tables.routes.push({ id: `x${k}`, slug: `x${k}`, name: `X${k}`, universe: 'marvel', published: true, requires_plan: 'free', position: 10 + k });
    const { sb, calls } = spy(as(db, READER));
    await getRouteUnitMap(sb);
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('returns title counts for every published route but hides premium unit ids from free users', async () => {
    const { sb } = spy(as(fixture(), READER));
    const map = await getRouteUnitMap(sb);
    expect(map.map((r) => r.route.slug)).toEqual(['free', 'paid']);
    expect(map[0]).toMatchObject({ count: 2 });
    expect([...map[0].unitIds].sort()).toEqual(['u1', 'u2', 'u3']);
    expect(map[1]).toMatchObject({ count: 1, unitCount: 1, unitIds: [] });
  });

  it('gives premium users the unit ids of premium routes', async () => {
    const map = await getRouteUnitMap(as(fixture(), PREMIUM));
    expect(map[1]).toMatchObject({ count: 1, unitIds: ['u4'] });
  });
});

describe('getRoute', () => {
  it('does not fetch the items of a premium route for a free user', async () => {
    const { sb, calls } = spy(as(fixture(), READER));
    const data = await getRoute(sb, 'paid', { plan: 'free', role: 'user' });
    expect(data).toMatchObject({ locked: true, items: [] });
    expect(calls).not.toContain('from:route_items');
  });

  it('returns the items of a premium route for a premium user', async () => {
    const { sb } = spy(as(fixture(), PREMIUM));
    const data = await getRoute(sb, 'paid', { plan: 'premium', role: 'user' });
    expect(data?.locked).toBe(false);
    expect(data?.items.map((i) => i.slug)).toEqual(['naruto']);
  });

  it('returns null for a missing route', async () => {
    expect(await getRoute(as(fixture(), READER), 'nope', null)).toBeNull();
  });
});
