/** Shapes the catalog admin pages pass to their components (rows come untyped from Supabase). */

export type TitleKind = 'comic' | 'anime';

/** One row of the titles table. */
export type TitleListItem = {
  id: string;
  slug: string;
  kind: string;
  universe: string | null;
  title: string;
  year_label: string | null;
  media_units?: { count: number }[];
};

/** A title as edited on its admin page. */
export type TitleRecord = {
  id: string;
  slug: string;
  kind: TitleKind;
  title: string;
  universe: string | null;
  year_label: string | null;
  credits: string | null;
  search_hint: string | null;
  where_label: string | null;
  where_url: string | null;
  description: string | null;
  cover_url: string | null;
};

/** A unit linked to a title (media_units joined with units). */
export type TitleUnit = {
  unit_id: string;
  short: string;
  group_name: string | null;
  position: number;
  units: { label: string; file_path: string | null; file_format: string | null } | null;
};

/** Consecutive units that share a group name. */
export type UnitGroup = { name: string | null; units: TitleUnit[] };
