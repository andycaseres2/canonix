import type { APIRoute } from 'astro';
import { kindWord } from '../../../lib/kinds';
import { COVER_MAX_BYTES, UNIT_FORMATS, UNIT_FORMAT_LIST, checkPages, coverPath, extensionOf, isUnitNumber, jsonError, mapLimit, readJson, signUpload, unitFolder, unitLabel, unitPath } from '../../../lib/uploads';

/** Step 1 of an upload: validate the file and hand the browser a signed Storage URL. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const { kind, media_id, filename, content_type, size } = body.data ?? {};
  const sb = locals.supabase;

  if (kind === 'unit-pages') {
    if (typeof media_id !== 'string') return jsonError(400, 'Faltan datos del título.');
    const { data: media } = await sb.from('media').select('id, slug, kind, unit_type, title').eq('id', media_id).maybeSingle();
    if (!media) return jsonError(404, 'Título no encontrado.');
    const number = body.data.number;
    if (!isUnitNumber(number)) return jsonError(400, 'Indica un número entero válido para el archivo.');
    const checked = checkPages(body.data.pages);
    if ('error' in checked) return jsonError(400, checked.error);
    const label = unitLabel(media, number, body.data.series);
    const { data: unit } = await sb.from('units').select('file_path').eq('label', label).maybeSingle();
    const folder = unitFolder(media.slug, number);
    // One signed upload URL per page; a few at a time to stay friendly with the Storage API
    const targets = await mapLimit(checked.pages, 8, async (p) => ({ name: p.name, ...(await signUpload(sb, 'content', `${folder}${p.name}`, p.content_type)) }));
    const failed = targets.find((t) => 'error' in t);
    if (failed && 'error' in failed) return jsonError(403, failed.error!);
    return Response.json({ folder, targets, label, replaces: !!unit?.file_path });
  }

  if (typeof media_id !== 'string' || typeof filename !== 'string' || typeof content_type !== 'string' || typeof size !== 'number') {
    return jsonError(400, 'Faltan datos del archivo.');
  }
  const { data: media } = await sb.from('media').select('id, slug, kind, unit_type, title').eq('id', media_id).maybeSingle();
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
    const contentType = UNIT_FORMATS[extensionOf(filename)];
    if (!contentType) return jsonError(400, `Para un ${kindWord(media.kind)} sube archivos ${UNIT_FORMAT_LIST}.`);
    const label = unitLabel(media, number, body.data.series);
    const { data: unit } = await sb.from('units').select('file_path').eq('label', label).maybeSingle();
    const target = await signUpload(sb, 'content', unitPath(media.slug, number, filename), contentType);
    return 'error' in target ? jsonError(403, target.error!) : Response.json({ ...target, label, replaces: !!unit?.file_path });
  }
  return jsonError(400, 'Tipo de subida desconocido.');
};
