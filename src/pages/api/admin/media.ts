import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { back, slugify } from '../../../lib/data';
import { createMedia, mediaFields } from '../../../lib/media';
import { str } from '../../../lib/form';
import { coverStoragePath, removeStored } from '../../../lib/uploads';
import { refreshRouteMeta } from '../../../lib/routes';
import { unitWords } from '../../../lib/kinds';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const action = f.get('action');

  const fields = () => mediaFields((k, max) => str(f, k, max), f.get('kind'));

  if (action === 'create') {
    const data = fields();
    if (!data.title) return redirect(back('/admin/media', { error: 'El título es obligatorio.' }));
    const row = await createMedia(sb, { ...data, title: data.title });
    if ('error' in row) return redirect(back('/admin/media', { error: row.error! }));
    return redirect(back(`/admin/media/${row.id}`, { ok: `Título creado. Ahora agrega sus ${unitWords(data.unit_type).many}.` }));
  }

  const id = str(f, 'id', 40);
  if (!id) return redirect('/admin/media');

  if (action === 'update') {
    const slug = slugify(str(f, 'slug', 120) ?? '');
    if (!slug) return redirect(back(`/admin/media/${id}`, { error: 'Slug inválido.' }));
    const { error } = await sb.from('media').update({ ...fields(), slug }).eq('id', id);
    return redirect(back(`/admin/media/${id}`, error ? { error: error.message } : { ok: 'Guardado.' }));
  }
  if (action === 'delete') return deleteTitle(sb, id, redirect);
  return redirect('/admin/media');
};

/**
 * Deletes a title: its links and route items go with it (on delete cascade). Then each of its units that no
 * other title links is deleted too (its progress cascades) with its stored file or pages, the cover file is
 * removed and the routes it was in recompute their kind and universe. Database first: if that fails nothing
 * else changes; a storage failure afterwards only adds a warning, since nothing points at those files anymore.
 */
async function deleteTitle(sb: SupabaseClient, id: string, redirect: (to: string) => Response) {
  const to = `/admin/media/${id}`;
  const { data: m } = await sb.from('media').select('cover_url').eq('id', id).maybeSingle();
  if (!m) return redirect(back('/admin/media', { error: 'Título no encontrado.' }));
  const [links, items] = await Promise.all([
    sb.from('media_units').select('unit_id').eq('media_id', id),
    sb.from('route_items').select('route_id').eq('media_id', id),
  ]);
  const listError = links.error ?? items.error;
  if (listError) return redirect(back(to, { error: listError.message }));
  const unitIds: string[] = (links.data ?? []).map((l) => l.unit_id);
  const routeIds = [...new Set((items.data ?? []).map((i) => i.route_id as string))];

  const { data: gone, error } = await sb.from('media').delete().eq('id', id).select('id');
  if (error) return redirect(back(to, { error: error.message }));
  if (!gone?.length) return redirect(back(to, { error: 'No se pudo borrar el título.' }));

  const warnings = new Set<string>();
  const filesLeft = 'Algunos archivos no se pudieron borrar del almacenamiento.';
  for (const unitId of unitIds) {
    // Deleting a unit would also cascade away its links to other titles: only when the count is certain to be 0
    const { count, error: countError } = await sb.from('media_units').select('unit_id', { count: 'exact', head: true }).eq('unit_id', unitId);
    if (countError || count === null) {
      console.error('[media.delete] could not count the links of a unit, kept it', unitId, countError);
      warnings.add('No se pudo comprobar si algunas de sus entregas están en otros títulos: se conservan con sus archivos.');
      continue;
    }
    if (count > 0) continue;
    const { data: unit, error: deleteError } = await sb.from('units').delete().eq('id', unitId).select('file_path, pages').maybeSingle();
    if (deleteError) {
      console.error('[media.delete] unit left in the database', unitId, deleteError);
      warnings.add('Algunas entregas no se pudieron borrar.');
      continue;
    }
    if (!unit) continue;
    try {
      await removeStored(sb, unit);
    } catch (e) {
      console.error('[media.delete] files left in storage', unit.file_path, e);
      warnings.add(filesLeft);
    }
  }

  const cover = coverStoragePath(m.cover_url);
  if (cover) {
    const { error: coverError } = await sb.storage.from('covers').remove([cover]);
    if (coverError) {
      console.error('[media.delete] cover left in storage', cover, coverError);
      warnings.add(filesLeft);
    }
  }
  for (const routeId of routeIds) await refreshRouteMeta(sb, routeId);
  return redirect(back('/admin/media', { ok: ['Título borrado.', ...warnings].join(' ') }));
}
