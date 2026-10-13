import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrackerItem } from './types';

const MEDIA_FIELDS =
  'id, slug, kind, title, credits, year_label, search_hint, where_label, where_url, media_units(short, group_name, position, unit_id, units(label))';

type MediaRow = {
  id: string; slug: string; kind: 'comic' | 'anime'; title: string; credits: string | null; year_label: string | null;
  search_hint: string | null; where_label: string | null; where_url: string | null;
  media_units: { short: string; group_name: string | null; position: number; unit_id: string; units: { label: string } | null }[];
};

export function toTrackerItem(m: MediaRow, section: string | null = null): TrackerItem {
  const units = [...(m.media_units ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((u) => ({ id: u.unit_id, label: u.units?.label ?? u.short, short: u.short, group: u.group_name }));
  return {
    slug: m.slug, kind: m.kind, title: m.title, credits: m.credits, year: m.year_label, hint: m.search_hint,
    whereLabel: m.where_label, whereUrl: m.where_url, section, units,
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

export async function getRoute(sb: SupabaseClient, slug: string) {
  const { data: route } = await sb.from('routes').select('*').eq('slug', slug).maybeSingle();
  if (!route) return null;
  const { data: rows, error } = await sb
    .from('route_items')
    .select(`section, position, media:media_id(${MEDIA_FIELDS})`)
    .eq('route_id', route.id)
    .order('position');
  if (error) throw error;
  const items = (rows ?? [])
    .filter((r: any) => r.media)
    .map((r: any) => toTrackerItem(r.media as MediaRow, r.section));
  return { route, items };
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

/** Ids de unidades por ruta publicada, para calcular el % de avance. */
export async function getRouteUnitMap(sb: SupabaseClient) {
  const { data: routes } = await sb
    .from('routes')
    .select('id, slug, name, universe, kind, description, requires_plan, position')
    .eq('published', true)
    .order('position');
  const result: { route: any; unitIds: string[]; count: number }[] = [];
  for (const route of routes ?? []) {
    const { data: items } = await sb.from('route_items').select('media_id').eq('route_id', route.id);
    const mediaIds = (items ?? []).map((i) => i.media_id);
    const units = mediaIds.length
      ? await fetchAll<{ unit_id: string }>((a, b) => sb.from('media_units').select('unit_id').in('media_id', mediaIds).range(a, b))
      : [];
    result.push({ route, unitIds: [...new Set(units.map((u) => u.unit_id))], count: mediaIds.length });
  }
  return result;
}

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
