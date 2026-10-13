import type { APIRoute } from 'astro';

const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

export const POST: APIRoute = async ({ request, locals }) => {
  const { supabase, user } = locals;
  if (!user) return new Response('Inicia sesión', { status: 401 });
  let body: { add?: unknown[]; remove?: unknown[] };
  try { body = await request.json(); } catch { return new Response('JSON inválido', { status: 400 }); }
  const add = (body.add ?? []).filter(isUuid).slice(0, 5000);
  const remove = (body.remove ?? []).filter(isUuid).slice(0, 5000);

  for (let i = 0; i < add.length; i += 500) {
    const rows = add.slice(i, i + 500).map((unit_id) => ({ user_id: user.id, unit_id }));
    const { error } = await supabase.from('progress').upsert(rows, { onConflict: 'user_id,unit_id', ignoreDuplicates: true });
    if (error) return new Response(error.message, { status: 500 });
  }
  for (let i = 0; i < remove.length; i += 500) {
    const { error } = await supabase.from('progress').delete().eq('user_id', user.id).in('unit_id', remove.slice(i, i + 500));
    if (error) return new Response(error.message, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
