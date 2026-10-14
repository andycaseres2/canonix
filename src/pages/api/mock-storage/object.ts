import type { APIRoute } from 'astro';
import { USE_MOCK } from '../../../lib/config';
import { getDemoDb } from '../../../lib/mock/seed';

/** Demo-mode file server: public buckets are open, private ones need a signed-URL token. */
export const GET: APIRoute = async ({ url }) => {
  if (!USE_MOCK) return new Response('Not found', { status: 404 });
  const bucket = url.searchParams.get('bucket') ?? '';
  const path = url.searchParams.get('path') ?? '';
  const storage = getDemoDb().storage;
  if (!storage.canRead(bucket, path, url.searchParams.get('token'))) return new Response('Forbidden', { status: 403 });
  const file = storage.read(bucket, path);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.bytes, {
    headers: { 'Content-Type': file.contentType || 'application/octet-stream', 'Content-Length': String(file.size), 'Cache-Control': 'private, max-age=300' },
  });
};
