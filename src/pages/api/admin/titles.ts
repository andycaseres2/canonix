import type { APIRoute } from 'astro';
import { createMedia, mediaFields } from '../../../lib/media';
import { jsonError, readJson } from '../../../lib/uploads';

/** Creates a title from the "Nuevo cómic o anime" screen; the page then uploads its cover and files. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  const body = await readJson(request, url);
  if ('error' in body) return body.error;
  const input = body.data ?? {};
  const read = (key: string, max: number) => (typeof input[key] === 'string' && input[key].trim() ? input[key].trim().slice(0, max) : null);
  const fields = mediaFields(read, input.kind);
  if (!fields.title) return jsonError(400, 'Ponle un nombre al cómic o anime.');
  const created = await createMedia(locals.supabase, { ...fields, title: fields.title });
  return 'error' in created ? jsonError(500, created.error!) : Response.json(created);
};
