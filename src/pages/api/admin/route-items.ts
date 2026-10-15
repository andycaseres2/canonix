import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { str } from '../../../lib/form';
import { refreshRouteMeta, swapWithNeighbour } from '../../../lib/routes';

/** Stages of a route (title + description) and the comics/mangas inside each stage. */
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
    // One or several titles picked from the list, added in the order they were picked
    const sectionId = str(f, 'section_id', 40);
    const mediaIds = [...new Set(f.getAll('media_id').map(String).filter((v) => /^[\w-]{1,40}$/.test(v)))].slice(0, 300);
    const { data: stage } = await sb.from('route_sections').select('id').eq('id', sectionId ?? '').eq('route_id', routeId).maybeSingle();
    if (!stage || !mediaIds.length) return go({ error: 'Etapa no encontrada.' });
    const { data: present } = await sb.from('route_items').select('media_id').eq('route_id', routeId).in('media_id', mediaIds);
    const already = new Set((present ?? []).map((p) => p.media_id));
    const fresh = mediaIds.filter((m) => !already.has(m));
    const hash = `#etapa-${stage.id}`;
    if (!fresh.length) return go({ error: mediaIds.length === 1 ? 'Ese título ya está en la ruta.' : 'Esos títulos ya están en la ruta.' }, hash);
    const { data: last } = await sb.from('route_items').select('position').eq('route_id', routeId).order('position', { ascending: false }).limit(1).maybeSingle();
    let pos = last?.position ?? 0;
    const { error } = await sb.from('route_items').insert(fresh.map((media_id) => ({ route_id: routeId, section_id: stage.id, media_id, position: ++pos })));
    if (error) return go({ error: error.message }, hash);
    await refreshRouteMeta(sb, routeId);
    const skipped = mediaIds.length - fresh.length;
    const ok = (fresh.length === 1 ? 'Agregado.' : `Se agregaron ${fresh.length}.`) + (skipped ? ` ${skipped} ya estaba${skipped === 1 ? '' : 'n'} en la ruta.` : '');
    return go({ ok }, hash);
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
