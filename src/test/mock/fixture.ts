import { MockDb } from './db';
import { createMockClient, type SessionStore } from './client';

/** Small, hand-built database for tests. */

export const ADMIN = '00000000-0000-4000-8000-000000000001';
export const READER = '00000000-0000-4000-8000-000000000002';
export const PREMIUM = '00000000-0000-4000-8000-000000000003';

export function memorySession(initial: string | null = null): SessionStore & { value: string | null } {
  return { value: initial, get() { return this.value; }, set(v) { this.value = v; }, clear() { this.value = null; } };
}

export function fixture() {
  const db = new MockDb();
  db.addUser({ id: ADMIN, email: 'admin@demo.com', password: 'demo1234', role: 'admin', plan: 'premium' });
  db.addUser({ id: READER, email: 'lector@demo.com', password: 'demo1234' });
  db.addUser({ id: PREMIUM, email: 'premium@demo.com', password: 'demo1234', plan: 'premium' });
  const t = db.tables;
  t.media.push(
    { id: 'm1', slug: 'asm', kind: 'comic', title: 'Spider-Man', year_start: 1962 },
    { id: 'm2', slug: 'ff', kind: 'comic', title: 'Fantastic Four', year_start: 1961 },
    { id: 'm3', slug: 'naruto', kind: 'anime', title: 'Naruto', year_start: 2002 },
  );
  t.units.push({ id: 'u1', label: 'ASM #1' }, { id: 'u2', label: 'ASM #2' }, { id: 'u3', label: 'FF #1' }, { id: 'u4', label: 'Naruto - Episodio 1' });
  t.media_units.push(
    { media_id: 'm1', unit_id: 'u2', short: '2', group_name: null, position: 2 },
    { media_id: 'm1', unit_id: 'u1', short: '1', group_name: null, position: 1 },
    { media_id: 'm2', unit_id: 'u3', short: '1', group_name: null, position: 1 },
    { media_id: 'm3', unit_id: 'u4', short: '1', group_name: null, position: 1 },
  );
  t.routes.push(
    { id: 'r1', slug: 'free', name: 'Free', universe: 'marvel', published: true, requires_plan: 'free', position: 1 },
    { id: 'r2', slug: 'draft', name: 'Draft', universe: 'dc', published: false, requires_plan: 'free', position: 2 },
    { id: 'r3', slug: 'paid', name: 'Paid', universe: 'anime', published: true, requires_plan: 'premium', position: 3 },
  );
  t.route_sections.push(
    { id: 's1', route_id: 'r1', title: 'A', description: 'Primera etapa', position: 1 },
    { id: 's3', route_id: 'r3', title: 'Naruto', description: null, position: 1 },
  );
  t.route_items.push(
    { id: 'i1', route_id: 'r1', section_id: 's1', media_id: 'm2', position: 1 },
    { id: 'i2', route_id: 'r1', section_id: 's1', media_id: 'm1', position: 2 },
    { id: 'i3', route_id: 'r3', section_id: 's3', media_id: 'm3', position: 1 },
  );
  return db;
}

export const as = (db: MockDb, uid: string | null) => createMockClient(db, memorySession(uid));
