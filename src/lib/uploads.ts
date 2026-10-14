import type { SupabaseClient } from '@supabase/supabase-js';
import { USE_MOCK } from './config';

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

/** Signed upload target the browser PUTs the raw file to (Supabase Storage, or the demo store). */
export async function signUpload(sb: SupabaseClient, bucket: string, path: string, contentType: string) {
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: error?.message ?? 'No se pudo preparar la subida.' };
  const headers: Record<string, string> = { 'Content-Type': contentType, 'x-upsert': 'true' };
  if (!USE_MOCK) headers.apikey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  return { uploadUrl: data.signedUrl, headers, path };
}

export async function fileExists(sb: SupabaseClient, bucket: string, path: string) {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash), name = path.slice(slash + 1);
  const { data } = await sb.storage.from(bucket).list(dir, { search: name, limit: 100 });
  return (data ?? []).some((f) => f.name === name);
}

/** Storage path of a cover we uploaded, or null for an external link. */
export function coverStoragePath(coverUrl: string | null) {
  if (!coverUrl) return null;
  if (coverUrl.startsWith('/api/mock-storage/object?')) {
    const u = new URL(coverUrl, 'http://x');
    return u.searchParams.get('bucket') === 'covers' ? u.searchParams.get('path') : null;
  }
  const marker = '/storage/v1/object/public/covers/';
  const i = coverUrl.indexOf(marker);
  return i >= 0 ? decodeURIComponent(coverUrl.slice(i + marker.length)) : null;
}
