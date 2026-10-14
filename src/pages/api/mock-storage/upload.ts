import type { APIRoute } from 'astro';
import { USE_MOCK } from '../../../lib/config';
import { getDemoDb } from '../../../lib/mock/seed';

/** Demo-mode target of signed upload URLs (Supabase Storage in production). The token is the authorization. */
export const PUT: APIRoute = async ({ request, url }) => {
  if (!USE_MOCK) return new Response('Not found', { status: 404 });
  const token = url.searchParams.get('token') ?? '';
  const bytes = new Uint8Array(await request.arrayBuffer());
  const error = getDemoDb().storage.acceptUpload(token, bytes, request.headers.get('Content-Type') ?? '');
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json({ ok: true });
};
