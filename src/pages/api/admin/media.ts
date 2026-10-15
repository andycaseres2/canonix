import type { APIRoute } from 'astro';
import { back, slugify } from '../../../lib/data';
import { createMedia, mediaFields } from '../../../lib/media';
import { str } from '../../../lib/form';
import { coverStoragePath } from '../../../lib/uploads';

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
    return redirect(back(`/admin/media/${row.id}`, { ok: 'Título creado. Ahora agrega sus episodios.' }));
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
