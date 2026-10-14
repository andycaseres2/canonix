import type { SupabaseClient } from '@supabase/supabase-js';

/** Shared rules and helpers for files the admin uploads straight to Storage. */

export const COVER_MAX_BYTES = 5 * 1024 * 1024;

export const extensionOf = (filename: string) => filename.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? 'bin';

/** Covers live in the title's folder; only the extension comes from the user's file name. */
export const coverPath = (slug: string, filename: string, stamp = Date.now()) => `${slug}/cover-${stamp}.${extensionOf(filename)}`;

export const jsonError = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Reads a JSON body only from same-origin JSON requests. Astro's checkOrigin does not
 * cover JSON bodies, and requiring the JSON content type forces a CORS preflight.
 */
export async function readJson(request: Request, url: URL): Promise<{ data: any } | { error: Response }> {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) return { error: jsonError(415, 'Se esperaba JSON.') };
  if (request.headers.get('Origin') !== url.origin) return { error: jsonError(403, 'Origen no permitido.') };
  try {
    return { data: await request.json() };
  } catch {
    return { error: jsonError(400, 'JSON inválido.') };
  }
}

/** Signed upload target the browser PUTs the raw file to (Supabase Storage). */
export async function signUpload(sb: SupabaseClient, bucket: string, path: string, contentType: string) {
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: error?.message ?? 'No se pudo preparar la subida.' };
  const headers: Record<string, string> = { 'Content-Type': contentType, 'x-upsert': 'true' };
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) headers.apikey = anonKey;
  return { uploadUrl: data.signedUrl, headers, path };
}

/** The stored file at `path` (with its size), or null when nothing was uploaded there. */
export async function findFile(sb: SupabaseClient, bucket: string, path: string) {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash), name = path.slice(slash + 1);
  const { data } = await sb.storage.from(bucket).list(dir, { search: name, limit: 100 });
  const file = (data ?? []).find((f) => f.name === name);
  return file ? { size: Number(file.metadata?.size ?? 0) } : null;
}

/** One file per issue/episode. The content type comes from the extension: browsers leave it empty for CBZ/CBR. */
export const UNIT_FORMATS: Record<'comic' | 'anime', Record<string, string>> = {
  comic: { cbz: 'application/vnd.comicbook+zip', cbr: 'application/vnd.comicbook-rar', pdf: 'application/pdf' },
  anime: { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska' },
};
export const formatList = (kind: 'comic' | 'anime') => Object.keys(UNIT_FORMATS[kind]).map((f) => f.toUpperCase()).join(', ').replace(/, (\w+)$/, ' o $1');
export const MAX_UNIT_NUMBER = 99999;
export const isUnitNumber = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_UNIT_NUMBER;

/**
 * Same labels add_range builds ("<series> #5", "<series> - Episodio 5"), so an uploaded file
 * joins the unit that already exists. The series defaults to the title.
 */
export const unitLabel = (media: { title: string; kind: string }, n: number, series?: unknown) => {
  const name = (typeof series === 'string' && series.trim() ? series.trim() : media.title).slice(0, 150);
  return media.kind === 'anime' ? `${name} - Episodio ${n}` : `${name} #${n}`;
};

export const unitPath = (slug: string, n: number, filename: string, stamp = Date.now()) =>
  `${slug}/${String(n).padStart(5, '0')}-${stamp}.${extensionOf(filename)}`;

/**
 * Issue/episode number from a file name such as "Naruto - 012 [1080p].mkv" or
 * "Uncanny X-Men 129 (1980).cbr". Ignores bracketed tags, years and resolutions.
 */
export function detectNumber(filename: string): number | null {
  const s = filename
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/\b\d{3,4}p\b/gi, ' ')
    .replace(/\b[xh]\.?26[45]\b/gi, ' ');
  const marked = s.match(/(?:#|\b(?:ep|episodio|episode|cap|capitulo|capítulo|chapter|ch|issue|n[º°o])\.?\s*)(\d{1,5})\b/i);
  if (marked) return parseInt(marked[1], 10);
  const numbers = [...s.matchAll(/\d+/g)].map((m) => m[0]).filter((n) => !(n.length === 4 && /^(19|20)/.test(n)));
  const last = numbers.at(-1);
  return last && last.length <= 5 ? parseInt(last, 10) : null;
}

/** Storage path of a cover we uploaded, or null for an external link. */
export function coverStoragePath(coverUrl: string | null) {
  if (!coverUrl) return null;
  const marker = '/storage/v1/object/public/covers/';
  const i = coverUrl.indexOf(marker);
  return i >= 0 ? decodeURIComponent(coverUrl.slice(i + marker.length)) : null;
}
