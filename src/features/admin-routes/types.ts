// Shapes the routes admin components receive from the pages.

/** A row of the routes list, with the embedded section/item counts. */
export interface RouteListRow {
  id: string;
  slug: string;
  name: string;
  universe: string | null;
  published: boolean;
  requires_plan: string;
  route_sections?: { count: number }[];
  route_items?: { count: number }[];
}

/** The editable fields of one route. */
export interface RouteRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  universe: string | null;
  kind: string;
  published: boolean;
  requires_plan: string;
}

/** One stage (route section). */
export interface Stage {
  id: string;
  title: string;
  description: string | null;
}

/** One title placed in a stage, with its media. */
export interface StageItem {
  id: string;
  media: { id: string; title: string; year_label: string | null; kind: string; cover_url: string | null } | null;
}

/** A title that can still be added, in the compact shape the picker script reads from #add-data. */
export interface PickerOption {
  id: string;
  t: string;
  y: string | null;
  u: string | null;
  k: string;
  c: string | null;
}
