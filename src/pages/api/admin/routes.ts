import type { APIRoute } from 'astro';
import { back, slugify } from '../../../lib/data';
import { str } from '../../../lib/form';

/** A route only needs a name and a description; universe and kind follow its titles. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const action = f.get('action');

  if (action === 'create') {
    const name = str(f, 'name', 120);
    if (!name) return redirect(back('/admin/rutas', { error: 'Falta el nombre.' }));
    let slug = slugify(name) || 'ruta';
    const { data: exists } = await sb.from('routes').select('id').eq('slug', slug).maybeSingle();
    if (exists) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: last } = await sb.from('routes').select('position').order('position', { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await sb.from('routes').insert({
      name, slug, description: str(f, 'description', 2000), universe: 'otros', kind: 'comic', position: (last?.position ?? 0) + 1,
    }).select('id').single();
    if (error) return redirect(back('/admin/rutas', { error: error.message }));
    return redirect(back(`/admin/rutas/${row.id}`, { ok: 'Ruta creada. Ahora crea sus etapas y agrégales cómics o animes.' }));
  }

  const id = str(f, 'id', 40);
  if (!id) return redirect('/admin/rutas');
  if (action === 'update') {
    const name = str(f, 'name', 120);
    if (!name) return redirect(back(`/admin/rutas/${id}`, { error: 'Falta el nombre.' }));
    const { error } = await sb.from('routes').update({
      name, description: str(f, 'description', 2000), published: f.get('published') === 'on',
      requires_plan: f.get('requires_plan') === 'premium' ? 'premium' : 'free',
    }).eq('id', id);
    return redirect(back(`/admin/rutas/${id}`, error ? { error: error.message } : { ok: 'Guardado.' }));
  }
  if (action === 'delete') {
    const { error } = await sb.from('routes').delete().eq('id', id);
    return redirect(back(error ? `/admin/rutas/${id}` : '/admin/rutas', error ? { error: error.message } : { ok: 'Ruta borrada.' }));
  }
  return redirect('/admin/rutas');
};
