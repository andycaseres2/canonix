import { describe, expect, it } from 'vitest';
import { kindFilter, routesOfKind } from './route-summary';

const route = (slug: string, kind: string) => ({ route: { slug, kind } });

describe('routesOfKind', () => {
  const routes = [route('c', 'comic'), route('m', 'manga'), route('x', 'mixed')];

  it('keeps every route without a filter', () => {
    expect(routesOfKind(routes, null).map((r) => r.route.slug)).toEqual(['c', 'm', 'x']);
  });

  it('keeps the routes of that kind plus the mixed ones', () => {
    expect(routesOfKind(routes, 'comic').map((r) => r.route.slug)).toEqual(['c', 'x']);
    expect(routesOfKind(routes, 'manga').map((r) => r.route.slug)).toEqual(['m', 'x']);
  });
});

describe('kindFilter', () => {
  it('accepts only comic and manga', () => {
    expect([kindFilter('comic'), kindFilter('manga'), kindFilter('anime'), kindFilter(null)]).toEqual(['comic', 'manga', null, null]);
  });
});
