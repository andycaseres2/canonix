import type { APIRoute } from 'astro';
import { back } from '../../../lib/data';
import { str } from '../../../lib/form';
import { removeStored } from '../../../lib/uploads';

// Removes a unit from a title. Units are only created by uploading their file, so a unit no other
// title has is deleted with its file or pages (its progress goes with it, on delete cascade).

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const mediaId = str(f, 'media_id', 40);
  if (!mediaId) return redirect('/admin/media');
  const to = `/admin/media/${mediaId}`;
  const action = f.get('action');

  if (action === 'remove') {
    const unitId = str(f, 'unit_id', 40);
    const { data: unlinked, error } = await sb.from('media_units').delete().eq('media_id', mediaId).eq('unit_id', unitId!).select('unit_id');
    if (error) return redirect(back(to, { error: error.message }));
    if (!unlinked?.length) return redirect(back(to, { error: 'Ese número no está en este título.' }));

    const { count } = await sb.from('media_units').select('unit_id', { count: 'exact', head: true }).eq('unit_id', unitId!);
    if (count) return redirect(back(to, { ok: 'Se quitó de este título. Sigue en otros títulos con su archivo.' }));

    // Database first: if deleting the files then fails, nothing points at them and the unit is already gone
    const { data: unit } = await sb.from('units').delete().eq('id', unitId!).select('file_path, pages').maybeSingle();
    if (unit) await removeStored(sb, unit);
    return redirect(back(to, { ok: 'Número borrado.' }));
  }
  return redirect(to);
};
