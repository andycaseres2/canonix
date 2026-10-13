import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { createServiceClient } from '../../../lib/supabase';
import { str } from '../../../lib/form';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const f = await request.formData();
  const id = str(f, 'id', 40);
  const action = f.get('action');
  const to = '/admin/usuarios';
  if (!id) return redirect(to);
  const isMe = id === locals.user?.id;

  if (action === 'update') {
    const plan = f.get('plan') === 'premium' ? 'premium' : 'free';
    const patch: Record<string, string> = { plan };
    if (!isMe) patch.role = f.get('role') === 'admin' ? 'admin' : 'user';
    const { error } = await locals.supabase.from('profiles').update(patch).eq('id', id);
    return redirect(back(to, error ? { error: error.message } : { ok: 'Usuario actualizado.' }));
  }

  if (isMe) return redirect(back(to, { error: 'No puedes bloquear ni borrar tu propia cuenta.' }));
  const service = createServiceClient();
  if (!service) return redirect(back(to, { error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }));

  if (action === 'ban' || action === 'unban') {
    const { error } = await service.auth.admin.updateUserById(id, { ban_duration: action === 'ban' ? '876000h' : 'none' });
    return redirect(back(to, error ? { error: error.message } : { ok: action === 'ban' ? 'Usuario bloqueado.' : 'Usuario desbloqueado.' }));
  }
  if (action === 'delete') {
    const { error } = await service.auth.admin.deleteUser(id);
    return redirect(back(to, error ? { error: error.message } : { ok: 'Usuario borrado.' }));
  }
  return redirect(to);
};
