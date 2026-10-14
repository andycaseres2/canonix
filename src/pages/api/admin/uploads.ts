import type { APIRoute } from 'astro';
import { COVER_MAX_BYTES, UNIT_FORMATS, coverPath, extensionOf, formatList, isUnitNumber, jsonError, readJson, signUpload, unitLabel, unitPath } from '../../../lib/uploads';

/** Step 1 of an upload: validate the file and hand the browser a signed Storage URL. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const { kind, media_id, filename, content_type, size } = body.data ?? {};
  if (typeof media_id !== 'string' || typeof filename !== 'string' || typeof content_type !== 'string' || typeof size !== 'number') {
    return jsonError(400, 'Faltan datos del archivo.');
  }
  const sb = locals.supabase;
  const { data: media } = await sb.from('media').select('id, slug, kind, title').eq('id', media_id).maybeSingle();
  if (!media) return jsonError(404, 'Título no encontrado.');

  if (kind === 'cover') {
    if (!content_type.startsWith('image/')) return jsonError(400, 'La portada debe ser una imagen (JPG, PNG, WEBP…).');
    if (size > COVER_MAX_BYTES) return jsonError(400, 'La portada pesa más de 5 MB.');
    const target = await signUpload(sb, 'covers', coverPath(media.slug, filename), content_type);
    return 'error' in target ? jsonError(403, target.error!) : Response.json(target);
  }
  if (kind === 'unit') {
    const number = body.data.number;
    if (!isUnitNumber(number)) return jsonError(400, 'Indica un número entero válido para el archivo.');
    if (extensionOf(filename) === 'cbr') return jsonError(400, 'Los CBR se convierten a CBZ en el navegador antes de subir. Vuelve a elegir el archivo desde el panel.');
    const contentType = UNIT_FORMATS[media.kind as 'comic' | 'anime'][extensionOf(filename)];
    if (!contentType) return jsonError(400, `Para ${media.kind === 'anime' ? 'un anime' : 'un cómic'} sube archivos ${formatList(media.kind)}.`);
    const label = unitLabel(media, number, body.data.series);
    const { data: unit } = await sb.from('units').select('file_path').eq('label', label).maybeSingle();
    const target = await signUpload(sb, 'content', unitPath(media.slug, number, filename), contentType);
    return 'error' in target ? jsonError(403, target.error!) : Response.json({ ...target, label, replaces: !!unit?.file_path });
  }
  return jsonError(400, 'Tipo de subida desconocido.');
};
