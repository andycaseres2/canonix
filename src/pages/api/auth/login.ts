import type { APIRoute } from 'astro';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? '/'));
  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.includes('confirm') ? 'Confirma tu correo antes de entrar.' : 'Correo o contraseña incorrectos.';
    return redirect(`/login?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  }
  return redirect(next);
};
