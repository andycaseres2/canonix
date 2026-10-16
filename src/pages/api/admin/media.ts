import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { back, slugify } from '../../../lib/data';
import { createMedia, mediaFields } from '../../../lib/media';
import { str } from '../../../lib/form';
import { coverStoragePath, parseUnitLabel, removeStored, unitLabel } from '../../../lib/uploads';
import { refreshRouteMeta } from '../../../lib/routes';
import { toUnitType, unitWords, type UnitType } from '../../../lib/kinds';

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
    const data = fields();
    const { data: before } = await sb.from('media').select('unit_type').eq('id', id).maybeSingle();
    const { error } = await sb.from('media').update({ ...data, slug }).eq('id', id);
    if (error) return redirect(back(`/admin/media/${id}`, { error: error.message }));
    const switched = before && toUnitType(before.unit_type) !== data.unit_type;
    const relabelled = switched ? await relabelUnits(sb, id, data.unit_type) : '';
    return redirect(back(`/admin/media/${id}`, { ok: `Guardado.${relabelled}` }));
  }
  if (action === 'delete') return deleteTitle(sb, id, redirect);
  return redirect('/admin/media');
};

/**
 * After a title switches between episodes and volumes, its units labelled the old way ("X #N" ↔ "X - Tomo N")
 * take the new format, so later uploads join them instead of creating new units. Labels are unique: a unit whose
 * new label is taken is skipped, and so is one that another title also uses. Returns the sentence for the message.
 */
async function relabelUnits(sb: SupabaseClient, mediaId: string, type: UnitType) {
  const { data: links, error } = await sb.from('media_units').select('unit_id, units(id, label)').eq('media_id', mediaId);
  if (error) return ' No se pudieron renombrar sus entregas.';
  const old = (links ?? []).flatMap((l: any) => {
    const parsed = l.units ? parseUnitLabel(l.units.label) : null;
    return parsed && parsed.type !== type ? [{ id: l.unit_id as string, label: unitLabel({ title: parsed.series, kind: '', unit_type: type }, parsed.n, parsed.series) }] : [];
  });
  if (!old.length) return '';

  const ids = old.map((u) => u.id);
  const [shared, taken] = await Promise.all([
    sb.from('media_units').select('unit_id, media_id').in('unit_id', ids),
    sb.from('units').select('label').in('label', old.map((u) => u.label)),
  ]);
  if (shared.error || taken.error) return ' No se pudieron renombrar sus entregas.';
  const elsewhere = new Set((shared.data ?? []).filter((l) => l.media_id !== mediaId).map((l) => l.unit_id as string));
  const labels = new Set((taken.data ?? []).map((u) => u.label as string));
  let renamed = 0, collided = 0, kept = 0;
  for (const unit of old) {
    if (elsewhere.has(unit.id)) { kept++; continue; }
    if (labels.has(unit.label)) { collided++; continue; }
    const { error: renameError } = await sb.from('units').update({ label: unit.label }).eq('id', unit.id);
    if (renameError) { collided++; continue; }
    labels.add(unit.label);
    renamed++;
  }
  const words = unitWords(type);
  return [
    renamed ? ` ${renamed} ${renamed === 1 ? `${words.one} renombrado` : `${words.many} renombrados`}.` : '',
    collided ? ` ${collided} no se ${collided === 1 ? 'renombró' : 'renombraron'} porque ya existe una entrega con ese nombre.` : '',
    kept ? ` ${kept} se ${kept === 1 ? 'dejó igual porque también está' : 'dejaron igual porque también están'} en otro título.` : '',
  ].join('');
}

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
