import { defineMiddleware } from 'astro:middleware';
import { createSupabase } from './lib/supabase';
import type { Profile } from './lib/types';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabase(context.request, context.cookies);
  const { data: { user } } = await supabase.auth.getUser();
  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = (data as Profile) ?? null;
  }
  context.locals.supabase = supabase;
  context.locals.user = user;
  context.locals.profile = profile;

  const path = context.url.pathname;
  const isAdminArea = path.startsWith('/admin') || path.startsWith('/api/admin');
  if (isAdminArea && profile?.role !== 'admin') {
    if (path.startsWith('/api/')) return new Response('No autorizado', { status: 403 });
    return context.redirect(user ? '/' : `/login?next=${encodeURIComponent(path)}`);
  }
  if (path.startsWith('/perfil') && !user) return context.redirect('/login?next=/perfil');
  return next();
});
