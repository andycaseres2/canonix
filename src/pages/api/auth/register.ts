import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const display_name = String(form.get('display_name') ?? '').trim().slice(0, 60);
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return redirect('/registro?error=' + encodeURIComponent('La contraseña debe tener al menos 8 caracteres.'));
  const { data, error } = await locals.supabase.auth.signUp({
    email, password,
    options: { data: { display_name }, emailRedirectTo: `${url.origin}/login?ok=${encodeURIComponent('Correo confirmado. Ya puedes entrar.')}` },
  });
  if (error) return redirect('/registro?error=' + encodeURIComponent(error.message));
  if (data.session) return redirect('/rutas?ok=' + encodeURIComponent('¡Bienvenido! Tu cuenta está lista.'));
  return redirect('/login?ok=' + encodeURIComponent('Te enviamos un correo para confirmar tu cuenta.'));
};
