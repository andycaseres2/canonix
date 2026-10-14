import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, TrackerItem } from './types';

const MEDIA_FIELDS =
  'id, slug, kind, title, credits, year_label, search_hint, where_label, where_url, media_units(short, group_name, position, unit_id, units(label))';

type MediaRow = {
  id: string; slug: string; kind: 'comic' | 'anime'; title: string; credits: string | null; year_label: string | null;
  search_hint: string | null; where_label: string | null; where_url: string | null;
  media_units: { short: string; group_name: string | null; position: number; unit_id: string; units: { label: string } | null }[];
};

type Stage = { id: string; title: string; description: string | null };

export function toTrackerItem(m: MediaRow, stage: Stage | null = null): TrackerItem {
  const units = [...(m.media_units ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((u) => ({ id: u.unit_id, label: u.units?.label ?? u.short, short: u.short, group: u.group_name }));
  return {
    slug: m.slug, kind: m.kind, title: m.title, credits: m.credits, year: m.year_label, hint: m.search_hint,
    whereLabel: m.where_label, whereUrl: m.where_url, units,
    sectionId: stage?.id ?? null, section: stage?.title ?? null, sectionDescription: stage?.description ?? null,
  };
}

/** Lee todas las filas superando el límite de 1000 de la API. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function getDoneUnitIds(sb: SupabaseClient, userId: string | undefined) {
  if (!userId) return new Set<string>();
  const rows = await fetchAll<{ unit_id: string }>((a, b) =>
    sb.from('progress').select('unit_id').eq('user_id', userId).range(a, b),
  );
  return new Set(rows.map((r) => r.unit_id));
}

/** Routes the user started, as route id -> start date. */
export async function getStartedRoutes(sb: SupabaseClient, userId: string | undefined) {
  if (!userId) return new Map<string, string>();
  const { data, error } = await sb.from('user_routes').select('route_id, started_at').eq('user_id', userId).order('started_at', { ascending: false });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.route_id as string, r.started_at as string]));
}

type Viewer = Pick<Profile, 'plan' | 'role'> | null;

/** A premium route is locked for viewers who are neither premium nor admin. */
export const isLocked = (route: { requires_plan: string }, viewer: Viewer) =>
  route.requires_plan === 'premium' && viewer?.plan !== 'premium' && viewer?.role !== 'admin';

/** Route plus its items; the items of a locked route are not fetched. */
export async function getRoute(sb: SupabaseClient, slug: string, viewer: Viewer) {
  const { data: route } = await sb.from('routes').select('*').eq('slug', slug).maybeSingle();
  if (!route) return null;
  if (isLocked(route, viewer)) return { route, items: [] as TrackerItem[], locked: true };
  const [stages, rows] = await Promise.all([
    sb.from('route_sections').select('id, title, description, position').eq('route_id', route.id).order('position'),
    sb.from('route_items').select(`section_id, position, media:media_id(${MEDIA_FIELDS})`).eq('route_id', route.id).order('position'),
  ]);
  if (stages.error) throw stages.error;
  if (rows.error) throw rows.error;
  // Stage order first, then the item's position inside the route
  const stageIndex = new Map((stages.data ?? []).map((s, i) => [s.id as string, { i, stage: s as Stage }]));
  const items = (rows.data ?? [])
    .filter((r: any) => r.media && stageIndex.has(r.section_id))
    .sort((a: any, b: any) => stageIndex.get(a.section_id)!.i - stageIndex.get(b.section_id)!.i || a.position - b.position)
    .map((r: any) => toTrackerItem(r.media as MediaRow, stageIndex.get(r.section_id)!.stage));
  return { route, items, locked: false };
}

export async function getMedia(sb: SupabaseClient, slug: string) {
  const { data, error } = await sb
    .from('media')
    .select(`${MEDIA_FIELDS}, description, cover_url, universe`)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as (MediaRow & { description: string | null; cover_url: string | null; universe: string | null }) | null;
}

/**
 * Published routes with their title count and unit ids, for the progress %.
 * Two queries in total: counts come from the route_unit_map() RPC, which also
 * covers premium routes whose items the viewer cannot read.
 */
export async function getRouteUnitMap(sb: SupabaseClient) {
  const [{ data: routes, error }, { data: map, error: rpcError }] = await Promise.all([
    sb.from('routes')
      .select('id, slug, name, universe, kind, description, requires_plan, position')
      .eq('published', true)
      .order('position'),
    sb.rpc('route_unit_map'),
  ]);
  if (error) throw error;
  if (rpcError) throw rpcError;
  const byRoute = new Map(((map ?? []) as RouteUnitRow[]).map((r) => [r.route_id, r]));
  return (routes ?? []).map((route) => {
    const row = byRoute.get(route.id);
    return { route, unitIds: row?.unit_ids ?? [], count: Number(row?.item_count ?? 0), unitCount: Number(row?.unit_count ?? 0) };
  });
}

/** unit_ids is empty for routes the viewer cannot read; unit_count is always the real total. */
type RouteUnitRow = { route_id: string; item_count: number; unit_count: number; unit_ids: string[] };

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Redirección con mensaje para formularios. */
export function back(url: string, msg: { ok?: string; error?: string }) {
  const u = new URL(url, 'http://x');
  u.searchParams.delete('ok');
  u.searchParams.delete('error');
  if (msg.ok) u.searchParams.set('ok', msg.ok);
  if (msg.error) u.searchParams.set('error', msg.error);
  return u.pathname + u.search;
}
