import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';
import type { Kind, UnitType } from './kinds';

/** Signed reader links outlive a long reading session but not a forgotten tab. */
export const READ_URL_SECONDS = 3 * 60 * 60;

export type ReaderViewer = Pick<Profile, 'id' | 'plan' | 'role'> | null;
/** 'reupload': the unit points at one file from before comics were stored by pages, so the reader cannot open it. */
export type ReaderState = 'ready' | 'login' | 'locked' | 'nofile' | 'reupload' | 'error';
export type ReaderUnit = { id: string; short: string; label: string; file_path: string | null; file_format: string | null; file_size: number | null; pages: string[] | null };

type Row = {
  id: string; slug: string; title: string; kind: Kind; unit_type: UnitType; requires_plan: 'free' | 'premium'; cover_url: string | null;
  media_units: { short: string; position: number; unit_id: string; units: Omit<ReaderUnit, 'id' | 'short'> | null }[];
};

/** A premium title is locked for viewers who are neither premium nor admin. */
export const isTitleLocked = (media: { requires_plan: string }, viewer: ReaderViewer) =>
  media.requires_plan === 'premium' && viewer?.plan !== 'premium' && viewer?.role !== 'admin';

/** Pages signed per request: the reader page ships the first batch, the viewer asks for the rest as it goes. */
export const PAGE_BATCH = 20;
export const PAGE_BATCH_MAX = 50;

/** The reader's viewer from the middleware's locals. */
export const readerViewer = (user: { id: string } | null, profile: Pick<Profile, 'plan' | 'role'> | null): ReaderViewer =>
  user && profile ? { id: user.id, plan: profile.plan, role: profile.role } : null;

/**
 * Who may read one issue/volume of a title, without signing anything: the unit, its previous/next units
 * that have a file, and the state ('ready' when the viewer may open its pages). Shared by the reader page and
 * the endpoint that signs more links, so both refuse exactly the same viewers.
 */
export async function getReaderAccess(sb: SupabaseClient, slug: string, short: string, viewer: ReaderViewer) {
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
  const state: Exclude<ReaderState, 'error'> =
    !viewer ? 'login' : isTitleLocked(media, viewer) ? 'locked' : !unit.file_path ? 'nofile' : !unit.pages?.length ? 'reupload' : 'ready';
  return {
    media, unit, state,
    prev: at > 0 ? withFile[at - 1] : null,
    next: at >= 0 && at < withFile.length - 1 ? withFile[at + 1] : null,
  };
}

/** Signed links for pages `from`..`from + count` of a paged unit, or null when storage refuses any of them. */
export async function signPages(sb: SupabaseClient, unit: ReaderUnit, from: number, count: number) {
  const names = (unit.pages ?? []).slice(from, from + count);
  if (!unit.file_path || !names.length) return null;
  const { data, error } = await sb.storage.from('content').createSignedUrls(names.map((p) => `${unit.file_path}${p}`), READ_URL_SECONDS);
  const urls = (data ?? []).map((s) => (s.error ? '' : (s.signedUrl ?? '')));
  return !error && urls.length === names.length && urls.every(Boolean) ? urls : null;
}

/**
 * One issue/volume of a title for the reader page: when the viewer may read it, its page count and the first
 * batch of signed pages. Storage RLS (rutas_content_read) has the final say.
 */
export async function getReader(sb: SupabaseClient, slug: string, short: string, viewer: ReaderViewer) {
  const access = await getReaderAccess(sb, slug, short, viewer);
  if (!access) return null;
  const result = (state: ReaderState, pages: string[] | null = null) => ({ ...access, state, pages, pageCount: access.unit.pages?.length ?? 0 });
  if (access.state !== 'ready') return result(access.state);
  const urls = await signPages(sb, access.unit, 0, PAGE_BATCH);
  return urls ? result('ready', urls) : result('error');
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
