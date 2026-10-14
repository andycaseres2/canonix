import type { APIRoute } from 'astro';
import { back, slugify } from '../../../lib/data';
import { str, url, yearStart } from '../../../lib/form';
import { coverStoragePath } from '../../../lib/uploads';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const action = f.get('action');

  const fields = () => {
    const year_label = str(f, 'year_label', 20);
    const kind = f.get('kind') === 'anime' ? 'anime' : 'comic';
    return {
      title: str(f, 'title', 200)!, kind, universe: str(f, 'universe', 40)?.toLowerCase() ?? null,
      credits: str(f, 'credits', 200), year_label, year_start: yearStart(year_label), description: str(f, 'description', 4000),
      search_hint: str(f, 'search_hint', 200), where_label: str(f, 'where_label', 80), where_url: url(f, 'where_url'),
    };
  };

  if (action === 'create') {
    const data = fields();
    if (!data.title) return redirect(back('/admin/media', { error: 'El título es obligatorio.' }));
    let slug = slugify(`${data.title}-${data.year_label ?? ''}`) || slugify(data.title);
    const { data: exists } = await sb.from('media').select('id').eq('slug', slug).maybeSingle();
    if (exists) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: row, error } = await sb.from('media').insert({ ...data, slug }).select('id').single();
    if (error) return redirect(back('/admin/media', { error: error.message }));
    return redirect(back(`/admin/media/${row.id}`, { ok: 'Título creado. Ahora agrega sus números o episodios.' }));
  }

  const id = str(f, 'id', 40);
  if (!id) return redirect('/admin/media');

  if (action === 'update') {
    const slug = slugify(str(f, 'slug', 120) ?? '');
    if (!slug) return redirect(back(`/admin/media/${id}`, { error: 'Slug inválido.' }));
    const { error } = await sb.from('media').update({ ...fields(), slug }).eq('id', id);
    return redirect(back(`/admin/media/${id}`, error ? { error: error.message } : { ok: 'Guardado.' }));
  }
  if (action === 'delete') {
    const { data: m } = await sb.from('media').select('cover_url').eq('id', id).maybeSingle();
    const { error } = await sb.from('media').delete().eq('id', id);
    const cover = coverStoragePath(m?.cover_url ?? null);
    if (!error && cover) await sb.storage.from('covers').remove([cover]);
    return redirect(back(error ? `/admin/media/${id}` : '/admin/media', error ? { error: error.message } : { ok: 'Título borrado.' }));
  }
  return redirect('/admin/media');
};
