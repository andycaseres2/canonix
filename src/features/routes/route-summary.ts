import type { getRouteUnitMap } from '../../lib/data';

/** One published route with its unit ids and title / unit counts, as returned by `getRouteUnitMap`. */
export type RouteSummary = Awaited<ReturnType<typeof getRouteUnitMap>>[number];

/** How many of `unitIds` are in `done`, and the rounded completion percentage. */
export function completion(unitIds: string[], done: Set<string>) {
  const doneCount = unitIds.filter((id) => done.has(id)).length;
  const pct = unitIds.length ? Math.round((doneCount / unitIds.length) * 100) : 0;
  return { doneCount, pct };
}
