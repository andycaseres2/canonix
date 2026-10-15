import type { getRouteUnitMap } from '../../lib/data';

/** One published route with its unit ids and title / unit counts, as returned by `getRouteUnitMap`. */
export type RouteSummary = Awaited<ReturnType<typeof getRouteUnitMap>>[number];

/** The `tipo` filter of a list page: 'comic' or 'manga', anything else means no filter. */
export const kindFilter = (value: string | null): 'comic' | 'manga' | null => (value === 'comic' || value === 'manga' ? value : null);

/** Routes of a kind, mixed ones included since they have titles of both; all of them without a filter. */
export const routesOfKind = <T extends { route: { kind: string } }>(routes: T[], kind: string | null) =>
  kind ? routes.filter((r) => r.route.kind === kind || r.route.kind === 'mixed') : routes;

/** How many of `unitIds` are in `done`, and the rounded completion percentage. */
export function completion(unitIds: string[], done: Set<string>) {
  const doneCount = unitIds.filter((id) => done.has(id)).length;
  const pct = unitIds.length ? Math.round((doneCount / unitIds.length) * 100) : 0;
  return { doneCount, pct };
}
