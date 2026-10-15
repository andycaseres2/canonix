import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A route's universe and kind come from its titles: the most common universe,
 * and comic / manga / mixed. Called after titles are added or removed.
 */
export async function refreshRouteMeta(sb: SupabaseClient, routeId: string) {
  const { data } = await sb.from('route_items').select('media:media_id(kind, universe)').eq('route_id', routeId);
  const media = (data ?? []).map((r: any) => r.media).filter(Boolean) as { kind: string; universe: string | null }[];
  const kinds = new Set(media.map((m) => m.kind));
  const kind = kinds.size > 1 ? 'mixed' : kinds.has('manga') ? 'manga' : 'comic';
  const counts = new Map<string, number>();
  media.forEach((m) => { if (m.universe) counts.set(m.universe, (counts.get(m.universe) ?? 0) + 1); });
  const universe = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'otros';
  await sb.from('routes').update({ kind, universe }).eq('id', routeId);
}

/** Swaps a row with its neighbour (by position) inside the given list. */
export async function swapWithNeighbour(sb: SupabaseClient, table: 'route_sections' | 'route_items', list: { id: string; position: number }[], id: string, dir: unknown) {
  const sorted = [...list].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((r) => r.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  await sb.from(table).update({ position: sorted[j].position }).eq('id', sorted[i].id);
  await sb.from(table).update({ position: sorted[i].position }).eq('id', sorted[j].id);
}
