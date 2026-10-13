export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  plan: 'free' | 'premium';
  created_at: string;
};

export type TrackerUnit = { id: string; label: string; short: string; group: string | null };

export type TrackerItem = {
  slug: string;
  kind: 'comic' | 'anime';
  title: string;
  credits: string | null;
  year: string | null;
  hint: string | null;
  whereLabel: string | null;
  whereUrl: string | null;
  section: string | null;
  units: TrackerUnit[];
};
