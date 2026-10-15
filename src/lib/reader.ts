import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';
import type { Kind, UnitType } from './kinds';

/** Signed reader links outlive a long episode but not a forgotten tab. */
export const READ_URL_SECONDS = 3 * 60 * 60;

export type ReaderViewer = Pick<Profile, 'id' | 'plan' | 'role'> | null;
export type ReaderState = 'ready' | 'login' | 'locked' | 'nofile' | 'error';
export type ReaderUnit = { id: string; short: string; label: string; file_path: string | null; file_format: string | null; file_size: number | null; pages: string[] | null };

type Row = {
  id: string; slug: string; title: string; kind: Kind; unit_type: UnitType; requires_plan: 'free' | 'premium'; cover_url: string | null;
  media_units: { short: string; position: number; unit_id: string; units: Omit<ReaderUnit, 'id' | 'short'> | null }[];
};

/** A premium title is locked for viewers who are neither premium nor admin. */
export const isTitleLocked = (media: { requires_plan: string }, viewer: ReaderViewer) =>
  media.requires_plan === 'premium' && viewer?.plan !== 'premium' && viewer?.role !== 'admin';

/**
 * One issue/episode of a title for the reader: when the viewer may read it, the signed url of its file or,
 * for a comic stored by pages, of every page (signed in one request). Also the previous/next units that
 * have a file. Storage RLS (rutas_content_read) has the final say.
 */
export async function getReader(sb: SupabaseClient, slug: string, short: string, viewer: ReaderViewer) {
  const { data, error } = await sb
    .from('media')
    .select('id, slug, title, kind, unit_type, requires_plan, cover_url, media_units(short, position, unit_id, units(label, file_path, file_format, file_size, pages))')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { media_units, ...media } = data as unknown as Row;
  const units: ReaderUnit[] = [...(media_units ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((mu) => ({ id: mu.unit_id, short: mu.short, label: mu.units?.label ?? mu.short, file_path: mu.units?.file_path ?? null, file_format: mu.units?.file_format ?? null, file_size: mu.units?.file_size ?? null, pages: mu.units?.pages ?? null }));
  const unit = units.find((u) => u.short === short);
  if (!unit) return null;

  const withFile = units.filter((u) => u.file_path);
  const at = withFile.indexOf(unit);
  const base = {
    media, unit, format: unit.file_format,
    prev: at > 0 ? withFile[at - 1] : null,
    next: at >= 0 && at < withFile.length - 1 ? withFile[at + 1] : null,
  };
  const result = (state: ReaderState, url: string | null = null, pages: string[] | null = null) => ({ ...base, state, url, pages });

  if (!viewer) return result('login');
  if (isTitleLocked(media, viewer)) return result('locked');
  if (!unit.file_path) return result('nofile');
  if (unit.pages) {
    const { data: signed, error: signError } = await sb.storage.from('content').createSignedUrls(unit.pages.map((p) => `${unit.file_path}${p}`), READ_URL_SECONDS);
    const urls = (signed ?? []).map((s) => (s.error ? '' : (s.signedUrl ?? '')));
    return !signError && urls.length === unit.pages.length && urls.every(Boolean) ? result('ready', null, urls) : result('error');
  }
  const { data: signed } = await sb.storage.from('content').createSignedUrl(unit.file_path, READ_URL_SECONDS);
  return signed?.signedUrl ? result('ready', signed.signedUrl) : result('error');
}

export type TitleUnitView = { id: string; short: string; label: string; group: string | null; has_file: boolean; file_format: string | null; file_size: number | null };

/** A title's units in order, for its public page: what each one is and whether it has a file (never the storage path). */
export async function getTitleUnits(sb: SupabaseClient, mediaId: string): Promise<TitleUnitView[]> {
  const { data, error } = await sb
    .from('media_units')
    .select('short, group_name, position, unit_id, units(label, file_path, file_format, file_size)')
    .eq('media_id', mediaId)
    .order('position');
  if (error) throw error;
  return ((data ?? []) as unknown as (Row['media_units'][number] & { group_name: string | null })[]).map((mu) => ({
    id: mu.unit_id, short: mu.short, label: mu.units?.label ?? mu.short, group: mu.group_name,
    has_file: Boolean(mu.units?.file_path), file_format: mu.units?.file_format ?? null, file_size: mu.units?.file_size ?? null,
  }));
}
