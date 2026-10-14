export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  plan: 'free' | 'premium';
  created_at: string;
};

export type TrackerUnit = { id: string; label: string; short: string; group: string | null; file: boolean };

export type TrackerItem = {
  slug: string;
  kind: 'comic' | 'anime';
  title: string;
  credits: string | null;
  year: string | null;
  hint: string | null;
  whereLabel: string | null;
  whereUrl: string | null;
  /** The title's files need premium */
  premium: boolean;
  /** Stage of the route the item belongs to (null outside a route) */
  sectionId: string | null;
  section: string | null;
  sectionDescription: string | null;
  units: TrackerUnit[];
};
