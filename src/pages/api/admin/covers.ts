import type { APIRoute } from 'astro';
import { coverStoragePath, fileExists, jsonError, readJson } from '../../../lib/uploads';

/** Step 2 of a cover upload, plus removing a cover or using an external link. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const { action, media_id } = body.data ?? {};
  const sb = locals.supabase;
  const { data: media } = await sb.from('media').select('id, slug, cover_url').eq('id', String(media_id)).maybeSingle();
  if (!media) return jsonError(404, 'Título no encontrado.');

  let cover: string | null;
  if (action === 'complete') {
    const path = String(body.data.path ?? '');
    const ownFolder = new RegExp(`^${media.slug.replace(/[^a-z0-9-]/g, '')}/cover-\\d+\\.[a-z0-9]{1,5}$`);
    if (!ownFolder.test(path) || !(await fileExists(sb, 'covers', path))) return jsonError(400, 'No encontramos la portada subida.');
    cover = sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
  } else if (action === 'link') {
    cover = typeof body.data.url === 'string' && /^https:\/\/\S+$/i.test(body.data.url) ? body.data.url.slice(0, 1000) : null;
    if (!cover) return jsonError(400, 'El link debe empezar con https://');
  } else if (action === 'remove') {
    cover = null;
  } else {
    return jsonError(400, 'Acción desconocida.');
  }

  const { error } = await sb.from('media').update({ cover_url: cover }).eq('id', media.id);
  if (error) return jsonError(500, error.message);
  const previous = coverStoragePath(media.cover_url);
  if (previous && previous !== coverStoragePath(cover)) await sb.storage.from('covers').remove([previous]);
  return Response.json({ ok: true, cover_url: cover });
};
