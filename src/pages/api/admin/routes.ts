import type { APIRoute } from 'astro';
import { back, slugify } from '../../../lib/data';
import { int, str } from '../../../lib/form';

const kindOf = (v: FormDataEntryValue | null) => (v === 'anime' || v === 'mixed' ? v : 'comic');

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const action = f.get('action');

  if (action === 'create') {
    const name = str(f, 'name', 120);
    if (!name) return redirect(back('/admin/rutas', { error: 'Falta el nombre.' }));
    let slug = slugify(name);
    const { data: exists } = await sb.from('routes').select('id').eq('slug', slug).maybeSingle();
    if (exists) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: row, error } = await sb.from('routes').insert({
      name, slug, universe: str(f, 'universe', 40)?.toLowerCase() ?? 'otros', kind: kindOf(f.get('kind')), description: str(f, 'description', 2000),
    }).select('id').single();
    if (error) return redirect(back('/admin/rutas', { error: error.message }));
    return redirect(back(`/admin/rutas/${row.id}`, { ok: 'Ruta creada. Agrégale títulos y publícala cuando esté lista.' }));
  }

  const id = str(f, 'id', 40);
  if (!id) return redirect('/admin/rutas');
  if (action === 'update') {
    const slug = slugify(str(f, 'slug', 120) ?? '');
    const { error } = await sb.from('routes').update({
      name: str(f, 'name', 120), slug, universe: str(f, 'universe', 40)?.toLowerCase(), kind: kindOf(f.get('kind')),
      description: str(f, 'description', 2000), published: f.get('published') === 'on',
      requires_plan: f.get('requires_plan') === 'premium' ? 'premium' : 'free', position: int(f, 'position') ?? 0,
    }).eq('id', id);
    return redirect(back(`/admin/rutas/${id}`, error ? { error: error.message } : { ok: 'Guardado.' }));
  }
  if (action === 'delete') {
    const { error } = await sb.from('routes').delete().eq('id', id);
    return redirect(back(error ? `/admin/rutas/${id}` : '/admin/rutas', error ? { error: error.message } : { ok: 'Ruta borrada.' }));
  }
  return redirect('/admin/rutas');
};
