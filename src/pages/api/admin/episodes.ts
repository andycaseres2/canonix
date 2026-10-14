import type { APIRoute } from 'astro';
import { UNIT_FORMATS, extensionOf, findFile, isUnitNumber, jsonError, readJson, unitLabel } from '../../../lib/uploads';

/**
 * Step 2 of an issue/episode upload: the uploaded file becomes (or joins) the unit
 * with that number, so the title's count follows its files. Also removes a unit's file.
 */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const sb = locals.supabase;
  const { action } = body.data ?? {};

  if (action === 'remove_file') {
    const { data: unit } = await sb.from('units').select('id, file_path').eq('id', String(body.data.unit_id)).maybeSingle();
    if (!unit) return jsonError(404, 'Número no encontrado.');
    const { error } = await sb.from('units').update({ file_path: null, file_format: null, file_size: null }).eq('id', unit.id);
    if (error) return jsonError(500, error.message);
    if (unit.file_path) await sb.storage.from('content').remove([unit.file_path]);
    return Response.json({ ok: true });
  }
  if (action !== 'complete') return jsonError(400, 'Acción desconocida.');

  const { data: media } = await sb.from('media').select('id, slug, kind, title').eq('id', String(body.data.media_id)).maybeSingle();
  if (!media) return jsonError(404, 'Título no encontrado.');
  const number = body.data.number;
  if (!isUnitNumber(number)) return jsonError(400, 'Número inválido.');
  const path = String(body.data.path ?? '');
  const ext = extensionOf(path);
  const ownPath = new RegExp(`^${media.slug.replace(/[^a-z0-9-]/g, '')}/${String(number).padStart(5, '0')}-\\d+\\.[a-z0-9]{1,5}$`);
  const file = ownPath.test(path) && UNIT_FORMATS[media.kind as 'comic' | 'anime'][ext] ? await findFile(sb, 'content', path) : null;
  if (!file) return jsonError(400, 'No encontramos el archivo subido.');

  const label = unitLabel(media, number);
  let { data: unit } = await sb.from('units').select('id, file_path').eq('label', label).maybeSingle();
  if (!unit) {
    const created = await sb.from('units').insert({ label }).select('id, file_path').single();
    if (created.error) return jsonError(500, created.error.message);
    unit = created.data;
  }
  const previous = unit!.file_path;
  const { error } = await sb.from('units').update({ file_path: path, file_format: ext, file_size: file.size }).eq('id', unit!.id);
  if (error) return jsonError(500, error.message);

  const { data: link } = await sb.from('media_units').select('unit_id').eq('media_id', media.id).eq('unit_id', unit!.id).maybeSingle();
  if (!link) {
    const { data: last } = await sb.from('media_units').select('position').eq('media_id', media.id).order('position', { ascending: false }).limit(1).maybeSingle();
    const group = typeof body.data.group === 'string' && body.data.group.trim() ? body.data.group.trim().slice(0, 120) : null;
    const { error: linkError } = await sb.from('media_units').insert({
      media_id: media.id, unit_id: unit!.id, short: String(number), group_name: group, position: (last?.position ?? 0) + 1,
    });
    if (linkError) return jsonError(500, linkError.message);
  }
  if (previous && previous !== path) await sb.storage.from('content').remove([previous]);
  return Response.json({ ok: true, unit_id: unit!.id, label });
};
