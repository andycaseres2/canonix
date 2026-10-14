import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { str } from '../../../lib/form';
import { refreshRouteMeta, swapWithNeighbour } from '../../../lib/routes';

/** Stages of a route (title + description) and the comics/animes inside each stage. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const routeId = str(f, 'route_id', 40);
  if (!routeId) return redirect('/admin/rutas');
  const id = str(f, 'id', 40);
  const action = f.get('action');
  const go = (msg: { ok?: string; error?: string }, hash = '') => redirect(back(`/admin/rutas/${routeId}`, msg) + hash);

  // ---------- Stages ----------
  if (action === 'section_create') {
    const title = str(f, 'title', 120);
    if (!title) return go({ error: 'Ponle un título a la etapa.' }, '#nueva-etapa');
    const { data: last } = await sb.from('route_sections').select('position').eq('route_id', routeId).order('position', { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await sb.from('route_sections')
      .insert({ route_id: routeId, title, description: str(f, 'description', 2000), position: (last?.position ?? 0) + 1 })
      .select('id').single();
    return error ? go({ error: error.message }) : go({ ok: 'Etapa creada.' }, `#etapa-${row.id}`);
  }
  if (action === 'section_update' && id) {
    const title = str(f, 'title', 120);
    if (!title) return go({ error: 'Ponle un título a la etapa.' }, `#etapa-${id}`);
    const { error } = await sb.from('route_sections').update({ title, description: str(f, 'description', 2000) }).eq('id', id).eq('route_id', routeId);
    return go(error ? { error: error.message } : { ok: 'Etapa guardada.' }, `#etapa-${id}`);
  }
  if (action === 'section_move' && id) {
    const { data } = await sb.from('route_sections').select('id, position').eq('route_id', routeId);
    await swapWithNeighbour(sb, 'route_sections', data ?? [], id, f.get('dir'));
    return go({}, `#etapa-${id}`);
  }
  if (action === 'section_delete' && id) {
    const { error } = await sb.from('route_sections').delete().eq('id', id).eq('route_id', routeId);
    if (!error) await refreshRouteMeta(sb, routeId);
    return go(error ? { error: error.message } : { ok: 'Etapa borrada.' });
  }

  // ---------- Titles inside a stage ----------
  if (action === 'item_add') {
    const sectionId = str(f, 'section_id', 40), mediaId = str(f, 'media_id', 40);
    const { data: stage } = await sb.from('route_sections').select('id').eq('id', sectionId ?? '').eq('route_id', routeId).maybeSingle();
    if (!stage || !mediaId) return go({ error: 'Etapa no encontrada.' });
    const { data: dup } = await sb.from('route_items').select('id').eq('route_id', routeId).eq('media_id', mediaId).maybeSingle();
    if (dup) return go({ error: 'Ese título ya está en la ruta.' }, `#etapa-${stage.id}`);
    const { data: last } = await sb.from('route_items').select('position').eq('route_id', routeId).order('position', { ascending: false }).limit(1).maybeSingle();
    const { error } = await sb.from('route_items').insert({ route_id: routeId, section_id: stage.id, media_id: mediaId, position: (last?.position ?? 0) + 1 });
    if (!error) await refreshRouteMeta(sb, routeId);
    return go(error ? { error: error.message } : { ok: 'Agregado.' }, `#etapa-${stage.id}`);
  }
  if (action === 'item_move' && id) {
    const { data: item } = await sb.from('route_items').select('section_id').eq('id', id).eq('route_id', routeId).maybeSingle();
    if (item) {
      const { data } = await sb.from('route_items').select('id, position').eq('section_id', item.section_id);
      await swapWithNeighbour(sb, 'route_items', data ?? [], id, f.get('dir'));
    }
    return go({}, item ? `#etapa-${item.section_id}` : '');
  }
  if (action === 'item_remove' && id) {
    const { data: item } = await sb.from('route_items').select('section_id').eq('id', id).eq('route_id', routeId).maybeSingle();
    const { error } = await sb.from('route_items').delete().eq('id', id).eq('route_id', routeId);
    if (!error) await refreshRouteMeta(sb, routeId);
    return go(error ? { error: error.message } : { ok: 'Quitado de la ruta.' }, item ? `#etapa-${item.section_id}` : '');
  }
  return go({});
};
