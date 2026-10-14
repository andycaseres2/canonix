import type { APIRoute } from 'astro';
import { COVER_MAX_BYTES, coverPath, jsonError, readJson, signUpload } from '../../../lib/uploads';

/** Step 1 of an upload: validate the file and hand the browser a signed Storage URL. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const { kind, media_id, filename, content_type, size } = body.data ?? {};
  if (typeof media_id !== 'string' || typeof filename !== 'string' || typeof content_type !== 'string' || typeof size !== 'number') {
    return jsonError(400, 'Faltan datos del archivo.');
  }
  const sb = locals.supabase;
  const { data: media } = await sb.from('media').select('id, slug, kind').eq('id', media_id).maybeSingle();
  if (!media) return jsonError(404, 'Título no encontrado.');

  if (kind === 'cover') {
    if (!content_type.startsWith('image/')) return jsonError(400, 'La portada debe ser una imagen (JPG, PNG, WEBP…).');
    if (size > COVER_MAX_BYTES) return jsonError(400, 'La portada pesa más de 5 MB.');
    const target = await signUpload(sb, 'covers', coverPath(media.slug, filename), content_type);
    return 'error' in target ? jsonError(403, target.error!) : Response.json(target);
  }
  return jsonError(400, 'Tipo de subida desconocido.');
};
