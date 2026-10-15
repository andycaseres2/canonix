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
    if (!unitId) return redirect(back(to, { error: 'Episodio inválido.' }));
    const { data: unlinked, error } = await sb.from('media_units').delete().eq('media_id', mediaId).eq('unit_id', unitId).select('unit_id');
    // A malformed id makes Postgres fail the uuid cast: same answer as a unit that is not here
    if (error || !unlinked?.length) return redirect(back(to, { error: 'Ese episodio no está en este título.' }));

    // Deleting the unit would also cascade away its links to other titles: only when the count is certain to be 0
    const { count, error: countError } = await sb.from('media_units').select('unit_id', { count: 'exact', head: true }).eq('unit_id', unitId);
    if (countError || count === null) return redirect(back(to, { error: 'Se quitó de este título, pero no se pudo comprobar si está en otros: el episodio y su archivo se conservan.' }));
    if (count > 0) return redirect(back(to, { ok: 'Se quitó de este título. Sigue en otros títulos con su archivo.' }));

    // Database first: if deleting the files then fails, nothing points at them and the unit is already gone
    const { data: unit, error: deleteError } = await sb.from('units').delete().eq('id', unitId).select('file_path, pages').maybeSingle();
    if (deleteError) return redirect(back(to, { error: `Se quitó de este título, pero no se pudo borrar el episodio: ${deleteError.message}` }));
    if (unit) {
      try {
        await removeStored(sb, unit);
      } catch (e) {
        console.error('[units.remove] files left in storage', unit.file_path, e);
        return redirect(back(to, { ok: 'Episodio borrado. Algunos archivos no se pudieron borrar del almacenamiento.' }));
      }
    }
    return redirect(back(to, { ok: 'Episodio borrado.' }));
  }
  return redirect(to);
};
