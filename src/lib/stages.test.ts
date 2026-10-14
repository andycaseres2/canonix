import { describe, expect, it } from 'vitest';
import { getRoute } from './data';
import { ADMIN, PREMIUM, READER, as, fixture } from '../test/mock/fixture';

describe('route_sections row level security', () => {
  it('stages follow the route lock: free, premium and draft', async () => {
    const db = fixture();
    db.tables.route_sections.push({ id: 's2', route_id: 'r2', title: 'Borrador', description: null, position: 1 });
    const titles = async (uid: string | null) => (await as(db, uid).from('route_sections').select('title').order('title')).data!.map((s) => s.title);
    expect(await titles(null)).toEqual(['A']);
    expect(await titles(READER)).toEqual(['A']);
    expect(await titles(PREMIUM)).toEqual(['A', 'Naruto']);
    expect(await titles(ADMIN)).toEqual(['A', 'Borrador', 'Naruto']);
  });

  it('only admins write stages', async () => {
    const { error } = await as(fixture(), READER).from('route_sections').insert({ route_id: 'r1', title: 'X', position: 2 });
    expect(error?.message).toMatch(/row-level security/);
  });

  it('deleting a stage removes its items; deleting a route removes its stages', async () => {
    const db = fixture();
    await as(db, ADMIN).from('route_sections').delete().eq('id', 's1');
    expect(db.tables.route_items.filter((i) => i.route_id === 'r1')).toEqual([]);
    await as(db, ADMIN).from('routes').delete().eq('id', 'r3');
    expect(db.tables.route_sections.some((s) => s.route_id === 'r3')).toBe(false);
  });
});

describe('getRoute with stages', () => {
  it('orders items by stage, then by position, and carries the stage title and description', async () => {
    const db = fixture();
    db.tables.route_sections.push({ id: 's0', route_id: 'r1', title: 'Antes', description: 'Lo primero', position: 0 });
    db.tables.route_items.find((i) => i.id === 'i2')!.section_id = 's0';
    const data = await getRoute(as(db, READER), 'free', null);
    expect(data!.items.map((i) => [i.slug, i.section, i.sectionDescription])).toEqual([
      ['asm', 'Antes', 'Lo primero'],
      ['ff', 'A', 'Primera etapa'],
    ]);
    expect(data!.items[0].sectionId).toBe('s0');
  });
});
