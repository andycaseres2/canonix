import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { back } from '../../../lib/data';
import { int, isGenericLabel, str } from '../../../lib/form';

type NewUnit = { label: string; short: string; group: string | null };

async function attach(sb: SupabaseClient, mediaId: string, list: NewUnit[]) {
  const { data: last } = await sb.from('media_units').select('position').eq('media_id', mediaId).order('position', { ascending: false }).limit(1).maybeSingle();
  let pos = last?.position ?? 0;
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const { error: e1 } = await sb.from('units').upsert(chunk.map((u) => ({ label: u.label })), { onConflict: 'label', ignoreDuplicates: true });
    if (e1) return e1.message;
    const { data: ids, error: e2 } = await sb.from('units').select('id, label').in('label', chunk.map((u) => u.label));
    if (e2) return e2.message;
    const byLabel = new Map((ids ?? []).map((u) => [u.label, u.id]));
    const rows = chunk.map((u) => ({ media_id: mediaId, unit_id: byLabel.get(u.label)!, short: u.short, group_name: u.group, position: ++pos }));
    const { error: e3 } = await sb.from('media_units').upsert(rows, { onConflict: 'media_id,unit_id', ignoreDuplicates: true });
    if (e3) return e3.message;
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const sb = locals.supabase;
  const f = await request.formData();
  const mediaId = str(f, 'media_id', 40);
  if (!mediaId) return redirect('/admin/media');
  const to = `/admin/media/${mediaId}`;
  const action = f.get('action');

  if (action === 'add_range') {
    const prefix = str(f, 'prefix', 150);
    const from = int(f, 'from'), until = int(f, 'to');
    const episode = f.get('format') === 'episode';
    if (!prefix || from === null || until === null || until < from) return redirect(back(to, { error: 'Revisa el nombre y el rango.' }));
    if (until - from > 2000) return redirect(back(to, { error: 'Máximo 2000 por rango.' }));
    const group = str(f, 'group', 120) ?? (episode ? null : `${prefix} #${from}–${until}`);
    const list: NewUnit[] = [];
    for (let n = from; n <= until; n++) {
      list.push({ label: episode ? `${prefix} - Episodio ${n}` : `${prefix} #${n}`, short: String(n), group });
    }
    const err = await attach(sb, mediaId, list);
    return redirect(back(to, err ? { error: err } : { ok: `Se agregaron ${list.length}.` }));
  }
  if (action === 'add_one') {
    const label = str(f, 'label', 200);
    if (!label) return redirect(back(to, { error: 'Falta el nombre.' }));
    if (isGenericLabel(label)) {
      return redirect(back(to, { error: 'Usa un nombre que identifique el número, por ejemplo "Watchmen #5". Un nombre genérico como "5" comparte el progreso con otros títulos.' }));
    }
    const err = await attach(sb, mediaId, [{ label, short: str(f, 'short', 40) ?? label, group: null }]);
    return redirect(back(to, err ? { error: err } : { ok: 'Agregado.' }));
  }
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
