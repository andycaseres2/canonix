import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { str } from '../../../lib/form';

// Unlinks units from a title. Units are only created by uploading their file.

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const mediaId = str(f, 'media_id', 40);
  if (!mediaId) return redirect('/admin/media');
  const to = `/admin/media/${mediaId}`;
  const action = f.get('action');

  if (action === 'remove') {
    const unitId = str(f, 'unit_id', 40);
    const { error } = await sb.from('media_units').delete().eq('media_id', mediaId).eq('unit_id', unitId!);
    return redirect(back(to, error ? { error: error.message } : {}));
  }
  if (action === 'clear') {
    const { error } = await sb.from('media_units').delete().eq('media_id', mediaId);
    return redirect(back(to, error ? { error: error.message } : { ok: 'Se quitaron todos.' }));
  }
  return redirect(to);
};
