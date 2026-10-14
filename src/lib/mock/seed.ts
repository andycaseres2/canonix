import { MockDb, type Row } from './db';
import marvelJson from './seed-marvel.json';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_ACCOUNTS = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'admin@demo.com', display_name: 'Admin Demo', role: 'admin', plan: 'premium' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'lector@demo.com', display_name: 'Lector Demo', role: 'user', plan: 'free' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'premium@demo.com', display_name: 'Premium Demo', role: 'user', plan: 'premium' },
] as const;

type SeedUnit = [label: string, short: string, group: string | null, position: number];
type SeedMedia = Row & { slug: string; units: SeedUnit[] };
type SeedRoute = Row & { slug: string; items: [slug: string, section: string | null, position: number][] };

/** Generated from supabase/02_seed_marvel.sql; JSON tuples need a cast to their tuple types. */
const marvel = marvelJson as unknown as { media: SeedMedia[]; routes: SeedRoute[] };

const range = (n: number, label: (i: number) => string, group: (i: number) => string | null = () => null): SeedUnit[] =>
  Array.from({ length: n }, (_, k) => [label(k + 1), String(k + 1), group(k + 1), k + 1]);

/** Extra demo content so every state is visible: an anime premium route and a DC draft route. */
const EXTRA_MEDIA: SeedMedia[] = [
  {
    slug: 'naruto', kind: 'anime', universe: 'anime', title: 'Naruto', credits: 'Studio Pierrot', year_label: '2002–2007', year_start: 2002,
    search_hint: 'Naruto (2002)', where_label: 'Crunchyroll', where_url: 'https://www.crunchyroll.com',
    description: 'La serie original: Naruto Uzumaki, la Academia Ninja y el examen Chūnin.',
    units: range(220, (i) => `Naruto - Episodio ${i}`, (i) => `Temporada ${Math.ceil(i / 55)}`),
  },
  {
    slug: 'naruto-shippuden', kind: 'anime', universe: 'anime', title: 'Naruto Shippuden', credits: 'Studio Pierrot', year_label: '2007–2017', year_start: 2007,
    search_hint: 'Naruto Shippuden', where_label: 'Crunchyroll', where_url: 'https://www.crunchyroll.com',
    units: range(500, (i) => `Naruto Shippuden - Episodio ${i}`, (i) => `Episodios ${Math.floor((i - 1) / 100) * 100 + 1}–${Math.min(Math.floor((i - 1) / 100) * 100 + 100, 500)}`),
  },
  {
    slug: 'batman-year-one', kind: 'comic', universe: 'dc', title: 'Batman: Year One', credits: 'Frank Miller y David Mazzucchelli', year_label: '1987', year_start: 1987,
    search_hint: 'Batman (1940) #404', where_label: 'DC Universe Infinite', where_url: 'https://www.dcuniverseinfinite.com',
    units: range(4, (i) => `Batman #${403 + i}`, () => 'Batman #404–407').map(([l, , g, p]) => [l, String(403 + p), g, p]),
  },
  {
    slug: 'dark-knight-returns', kind: 'comic', universe: 'dc', title: 'The Dark Knight Returns', credits: 'Frank Miller', year_label: '1986', year_start: 1986,
    search_hint: 'The Dark Knight Returns (1986)', where_label: 'DC Universe Infinite', where_url: 'https://www.dcuniverseinfinite.com',
    units: range(4, (i) => `The Dark Knight Returns #${i}`, () => 'The Dark Knight Returns #1–4'),
  },
  {
    slug: 'watchmen', kind: 'comic', universe: 'dc', title: 'Watchmen', credits: 'Alan Moore y Dave Gibbons', year_label: '1986–1987', year_start: 1986,
    search_hint: 'Watchmen (1986)', where_label: 'DC Universe Infinite', where_url: 'https://www.dcuniverseinfinite.com',
    units: range(12, (i) => `Watchmen #${i}`, () => 'Watchmen #1–12'),
  },
];

const EXTRA_ROUTES: SeedRoute[] = [
  {
    slug: 'naruto-completo', name: 'Naruto completo', universe: 'anime', kind: 'anime', published: true, requires_plan: 'premium', position: 2,
    description: 'Toda la saga de Naruto en orden de emisión. Ruta de ejemplo del plan premium.',
    items: [['naruto', 'Naruto', 1], ['naruto-shippuden', 'Shippuden', 2]],
  },
  {
    slug: 'dc-esencial', name: 'DC esencial', universe: 'dc', kind: 'comic', published: false, requires_plan: 'free', position: 3,
    description: 'Borrador: los clásicos de DC. Solo la ven los admins.',
    items: [['dark-knight-returns', 'Años 80', 1], ['watchmen', 'Años 80', 2], ['batman-year-one', 'Años 80', 3]],
  },
];

const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();

export function seedDemoDb() {
  const db = new MockDb();
  const t = db.tables;
  DEMO_ACCOUNTS.forEach((a, k) => db.addUser({ ...a, password: DEMO_PASSWORD, created_at: daysAgo(30 - k * 5) }));

  const mediaIds = new Map<string, string>();
  const unitIds = new Map<string, string>();
  for (const { units, ...m } of [...marvel.media, ...EXTRA_MEDIA]) {
    const row = db.withDefaults('media', m);
    t.media.push(row);
    mediaIds.set(row.slug, row.id);
    for (const [label, short, group_name, position] of units) {
      if (!unitIds.has(label)) {
        const unit = db.withDefaults('units', { label });
        t.units.push(unit);
        unitIds.set(label, unit.id);
      }
      const unit_id = unitIds.get(label)!;
      if (!t.media_units.some((r) => r.media_id === row.id && r.unit_id === unit_id)) {
        t.media_units.push({ media_id: row.id, unit_id, short, group_name, position });
      }
    }
  }

  for (const { items, ...r } of [...marvel.routes, ...EXTRA_ROUTES]) {
    const route = db.withDefaults('routes', r);
    t.routes.push(route);
    for (const [slug, section, position] of items) {
      t.route_items.push(db.withDefaults('route_items', { route_id: route.id, media_id: mediaIds.get(slug), section, position }));
    }
  }

  // Demo reader: first four titles of the Marvel route done, the fifth half way, spread over the last ten days.
  const reader = DEMO_ACCOUNTS[1].id;
  const marvelRoute = t.routes.find((r) => r.slug === 'marvel-esencial')!;
  t.user_routes.push({ user_id: reader, route_id: marvelRoute.id, started_at: daysAgo(10, 2) });
  const firstItems = t.route_items.filter((i) => i.route_id === marvelRoute.id).sort((a, b) => a.position - b.position).slice(0, 5);
  let n = 0;
  firstItems.forEach((item, k) => {
    const units = t.media_units.filter((mu) => mu.media_id === item.media_id).sort((a, b) => a.position - b.position);
    for (const mu of k < 4 ? units : units.slice(0, Math.ceil(units.length / 2))) {
      if (t.progress.some((p) => p.user_id === reader && p.unit_id === mu.unit_id)) continue;
      t.progress.push({ user_id: reader, unit_id: mu.unit_id, completed_at: daysAgo(10 - Math.min(9, Math.floor(n / 4)), n % 24) });
      n++;
    }
  });
  return db;
}

/** Bump when the mock tables change, so a running dev server reseeds instead of using a stale shape. */
const SEED_VERSION = 2;

/** One database per server process; survives Astro dev reloads, resets on restart. */
export function getDemoDb(): MockDb {
  const g = globalThis as typeof globalThis & { __rutasMockDb?: { version: number; db: MockDb } };
  if (g.__rutasMockDb?.version !== SEED_VERSION) g.__rutasMockDb = { version: SEED_VERSION, db: seedDemoDb() };
  return g.__rutasMockDb.db;
}
