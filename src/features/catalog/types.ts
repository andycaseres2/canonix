import type { Kind, UnitType } from '../../lib/kinds';

/** What the catalog shows about a title (card and title page header). */
export type TitleInfo = {
  kind: Kind;
  unit_type: UnitType;
  universe: string | null;
  title: string;
  credits: string | null;
  year_label: string | null;
  cover_url: string | null;
  requires_plan?: 'free' | 'premium';
};

/** A catalog title as listed on /catalogo (with its slug and unit count). */
export type CatalogMedia = TitleInfo & { slug: string; media_units?: { count: number }[] };

/** A published route that includes a title ("Está en"). */
export type RouteLink = { slug: string; name: string };
