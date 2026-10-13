import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  const form = await request.formData();
  const display_name = String(form.get('display_name') ?? '').trim().slice(0, 60);
  const { error } = await locals.supabase.from('profiles').update({ display_name }).eq('id', locals.user.id);
  return redirect('/perfil?' + (error ? 'error=' + encodeURIComponent(error.message) : 'ok=' + encodeURIComponent('Nombre actualizado.')));
};
