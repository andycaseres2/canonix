import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './data';
import { yearStart } from './form';
import { toKind } from './kinds';

/** Reads one trimmed text field (null when empty), capped at `max` characters. */
export type Read = (key: string, max: number) => string | null;

/** Title fields shared by the create form, the edit form and the "Nuevo título" screen. Covers are managed apart. */
export function mediaFields(read: Read, kind: unknown) {
  const year_label = read('year_label', 20);
  return {
    title: read('title', 200), kind: toKind(kind), universe: read('universe', 40)?.toLowerCase() ?? null,
    credits: read('credits', 200), year_label, year_start: yearStart(year_label), description: read('description', 4000),
    requires_plan: read('requires_plan', 10) === 'premium' ? 'premium' : 'free',
  };
}

/** Inserts a title with a unique slug built from its name and year. */
export async function createMedia(sb: SupabaseClient, data: ReturnType<typeof mediaFields> & { title: string }) {
  let slug = slugify(`${data.title}-${data.year_label ?? ''}`) || slugify(data.title) || 'titulo';
  const { data: exists } = await sb.from('media').select('id').eq('slug', slug).maybeSingle();
  if (exists) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: row, error } = await sb.from('media').insert({ ...data, slug }).select('id, slug').single();
  return error ? { error: error.message } : { id: row.id as string, slug: row.slug as string };
}
