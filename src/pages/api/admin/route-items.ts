import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { str } from '../../../lib/form';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const routeId = str(f, 'route_id', 40);
  if (!routeId) return redirect('/admin/rutas');
  const to = `/admin/rutas/${routeId}`;
  const action = f.get('action');
  const id = str(f, 'id', 40);

  if (action === 'add') {
    const mediaId = str(f, 'media_id', 40);
    if (!mediaId) return redirect(back(to, { error: 'Elige un título.' }));
    const { data: last } = await sb.from('route_items').select('position').eq('route_id', routeId).order('position', { ascending: false }).limit(1).maybeSingle();
    const { error } = await sb.from('route_items').insert({ route_id: routeId, media_id: mediaId, section: str(f, 'section', 120), position: (last?.position ?? 0) + 1 });
    if (error) return redirect(back(to, { error: error.code === '23505' ? 'Ese título ya está en la ruta.' : error.message }));
    return redirect(back(to, { ok: 'Agregado a la ruta.' }) + '#agregar');
  }
  if (action === 'bulk') {
    const lines = String(f.get('titles') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 300);
    const section = str(f, 'section', 120);
    const [{ data: media }, { data: current }] = await Promise.all([
      sb.from('media').select('id, slug, title, year_start'),
      sb.from('route_items').select('media_id, position').eq('route_id', routeId).order('position', { ascending: false }),
    ]);
    const inRoute = new Set((current ?? []).map((c) => c.media_id));
    let pos = current?.[0]?.position ?? 0;
    const added: string[] = [], missing: string[] = [], ambiguous: string[] = [], repeated: string[] = [];
    const rows: { route_id: string; media_id: string; section: string | null; position: number }[] = [];
    for (const line of lines) {
      const year = line.match(/\b(19|20)\d{2}\b/)?.[0];
      const name = norm(year ? line.replace(year, '') : line).replace(/[()]/g, '').trim();
      const bySlug = (media ?? []).filter((m) => m.slug === line.toLowerCase());
      let hits = bySlug.length ? bySlug : (media ?? []).filter((m) => norm(m.title) === name);
      if (!hits.length) hits = (media ?? []).filter((m) => norm(m.title).includes(name));
      if (year && !bySlug.length) hits = hits.filter((m) => String(m.year_start) === year);
      if (!hits.length) { missing.push(line); continue; }
      if (hits.length > 1) { ambiguous.push(line); continue; }
      const m = hits[0];
      if (inRoute.has(m.id)) { repeated.push(line); continue; }
      inRoute.add(m.id);
      rows.push({ route_id: routeId, media_id: m.id, section, position: ++pos });
      added.push(line);
    }
    if (rows.length) {
      const { error } = await sb.from('route_items').insert(rows);
      if (error) return redirect(back(to, { error: error.message }));
    }
    const parts = [`Agregados: ${added.length}.`];
    if (missing.length) parts.push(`No encontrados: ${missing.join(', ')}.`);
    if (ambiguous.length) parts.push(`Hay varios con ese nombre, agrega el año o usa su slug: ${ambiguous.join(', ')}.`);
    if (repeated.length) parts.push(`Ya estaban: ${repeated.join(', ')}.`);
    const msg = parts.join(' ');
    return redirect(back(to, missing.length || ambiguous.length ? { error: msg } : { ok: msg }));
  }
  if (action === 'remove' && id) {
    const { error } = await sb.from('route_items').delete().eq('id', id);
    return redirect(back(to, error ? { error: error.message } : {}));
  }
  if (action === 'section' && id) {
    const { error } = await sb.from('route_items').update({ section: str(f, 'section', 120) }).eq('id', id);
    return redirect(back(to, error ? { error: error.message } : {}));
  }
  if (action === 'move' && id) {
    const { data: items } = await sb.from('route_items').select('id, position').eq('route_id', routeId).order('position');
    const list = items ?? [];
    const i = list.findIndex((x) => x.id === id);
    const j = f.get('dir') === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      // Reasigna posiciones consecutivas (evita choques y huecos)
      for (let k = 0; k < list.length; k++) {
        if (list[k].position !== k + 1) await sb.from('route_items').update({ position: k + 1 }).eq('id', list[k].id);
      }
    }
    return redirect(to);
  }
  return redirect(to);
};
