import type { APIRoute } from 'astro';
import { back } from '../../lib/data';
import { str } from '../../lib/form';

/** Start a route (it shows up in Mi progreso) or remove it. Progress history is never touched. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const f = await request.formData();
  const slug = str(f, 'slug', 120);
  const to = slug && /^[a-z0-9-]+$/.test(slug) ? `/rutas/${slug}` : '/rutas';
  if (!locals.user) return redirect(`/login?next=${encodeURIComponent(to)}`);
  const routeId = str(f, 'route_id', 40);
  if (!routeId) return redirect(to);
  const sb = locals.supabase;

  if (f.get('action') === 'start') {
    const { error } = await sb
      .from('user_routes')
      .upsert({ user_id: locals.user.id, route_id: routeId }, { onConflict: 'user_id,route_id', ignoreDuplicates: true });
    return redirect(back(to, error ? { error: 'No puedes iniciar esta ruta.' } : { ok: 'Ruta iniciada. La verás en Mi progreso.' }));
  }
  if (f.get('action') === 'leave') {
    const { error } = await sb.from('user_routes').delete().eq('user_id', locals.user.id).eq('route_id', routeId);
    return redirect(back(to, error ? { error: error.message } : { ok: 'Quitaste la ruta de tu progreso. Tu historial se mantiene.' }));
  }
  return redirect(to);
};
