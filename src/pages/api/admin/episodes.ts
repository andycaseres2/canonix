import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UNIT_FORMATS, checkPages, extensionOf, findFile, isUnitNumber, jsonError, listFolder, readJson, removeStored, unitLabel } from '../../../lib/uploads';

type Media = { id: string; slug: string; kind: string; title: string };
type Stored = { file_path: string; file_format: string; file_size: number; pages: string[] | null };

/** "<slug>/00005-<stamp>" as a regex source: uploads of a title and number always start like this. */
const ownPrefix = (media: Media, number: number) => `^${media.slug.replace(/[^a-z0-9-]/g, '')}/${String(number).padStart(5, '0')}-\\d+`;

/**
 * Points the unit for that number (found by label, or created) at what was just stored, links it to
 * the title when it is new there, and deletes whatever the unit had stored before.
 */
async function attach(sb: SupabaseClient, media: Media, number: number, body: any, stored: Stored) {
  const label = unitLabel(media, number, body.series);
  let { data: unit } = await sb.from('units').select('id, file_path, pages').eq('label', label).maybeSingle();
  if (!unit) {
    const created = await sb.from('units').insert({ label }).select('id, file_path, pages').single();
    if (created.error) return jsonError(500, created.error.message);
    unit = created.data;
  }
  const previous = { file_path: unit!.file_path as string | null, pages: unit!.pages as string[] | null };
  const { error } = await sb.from('units').update(stored).eq('id', unit!.id);
  if (error) return jsonError(500, error.message);

  const { data: link } = await sb.from('media_units').select('unit_id').eq('media_id', media.id).eq('unit_id', unit!.id).maybeSingle();
  if (!link) {
    const { data: last } = await sb.from('media_units').select('position').eq('media_id', media.id).order('position', { ascending: false }).limit(1).maybeSingle();
    const group = typeof body.group === 'string' && body.group.trim() ? body.group.trim().slice(0, 120) : null;
    const { error: linkError } = await sb.from('media_units').insert({
      media_id: media.id, unit_id: unit!.id, short: String(number), group_name: group, position: (last?.position ?? 0) + 1,
    });
    if (linkError) return jsonError(500, linkError.message);
  }
  // The new file is in place; failing to delete the old one must not fail the upload
  if (previous.file_path && previous.file_path !== stored.file_path) await removeStored(sb, previous).catch((e) => console.error('[episodes] old files left in storage', previous.file_path, e));
  return Response.json({ ok: true, unit_id: unit!.id, label });
}

/**
 * Step 2 of an issue/episode upload: the uploaded file (or the folder of a comic's pages) becomes
 * (or joins) the unit with that number, so the title's count follows its files. Also removes a unit's file.
 */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const sb = locals.supabase;
  const { action } = body.data ?? {};

  if (action === 'remove_file') {
    const { data: unit } = await sb.from('units').select('id, file_path, pages').eq('id', String(body.data.unit_id)).maybeSingle();
    if (!unit) return jsonError(404, 'Episodio no encontrado.');
    const { error } = await sb.from('units').update({ file_path: null, file_format: null, file_size: null, pages: null }).eq('id', unit.id);
    if (error) return jsonError(500, error.message);
    await removeStored(sb, unit).catch((e) => console.error('[episodes.remove_file] files left in storage', unit.file_path, e));
    return Response.json({ ok: true });
  }
  if (action !== 'complete') return jsonError(400, 'Acción desconocida.');

  const { data: media } = await sb.from('media').select('id, slug, kind, title').eq('id', String(body.data.media_id)).maybeSingle();
  if (!media) return jsonError(404, 'Título no encontrado.');
  const number = body.data.number;
  if (!isUnitNumber(number)) return jsonError(400, 'Episodio inválido.');

  if (body.data.folder !== undefined) {
    // A comic uploaded page by page: every listed page must be in its folder
    const folder = String(body.data.folder);
    if (media.kind !== 'comic' || !new RegExp(`${ownPrefix(media, number)}/$`).test(folder)) return jsonError(400, 'No encontramos las páginas subidas.');
    const checked = checkPages((Array.isArray(body.data.pages) ? body.data.pages : []).map((name: unknown) => ({ name, size: 1 })));
    if ('error' in checked) return jsonError(400, checked.error);
    const uploaded = await listFolder(sb, 'content', folder);
    const missing = checked.pages.filter((p) => !uploaded.has(p.name)).length;
    if (missing) return jsonError(400, `Faltan ${missing} página${missing === 1 ? '' : 's'} por subir. Vuelve a intentarlo.`);
    const source = body.data.source === 'cbr' ? 'cbr' : 'cbz';
    const size = checked.pages.reduce((sum, p) => sum + uploaded.get(p.name)!, 0);
    return attach(sb, media, number, body.data, { file_path: folder, file_format: source, file_size: size, pages: checked.pages.map((p) => p.name) });
  }

  const path = String(body.data.path ?? '');
  const ext = extensionOf(path);
  const ownFile = new RegExp(`${ownPrefix(media, number)}\\.[a-z0-9]{1,5}$`);
  const file = ownFile.test(path) && UNIT_FORMATS[media.kind as 'comic' | 'anime'][ext] ? await findFile(sb, 'content', path) : null;
  if (!file) return jsonError(400, 'No encontramos el archivo subido.');
  return attach(sb, media, number, body.data, { file_path: path, file_format: ext, file_size: file.size, pages: null });
};
