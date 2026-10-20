import type { APIRoute } from 'astro';
import { PAGE_BATCH, PAGE_BATCH_MAX, getReaderAccess, readerViewer, signPages } from '../../../../lib/reader';

// Signed links are personal and short lived: keep them out of shared caches
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const REFUSED = {
  login: [401, 'Inicia sesión.'], locked: [403, 'Este título es premium.'], nofile: [404, 'No encontrado.'],
  reupload: [409, 'Este número hay que volver a subirlo.'],
} as const;

/** A whole number from the query, `fallback` when the parameter is absent, NaN when it is not a number. */
const intParam = (url: URL, name: string, fallback: number) => {
  const raw = url.searchParams.get(name);
  return raw === null ? fallback : /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
};

/**
 * Fresh signed links for the reader, with the same access checks as the reader page: a batch of pages
 * (`?from=40&count=20`).
 */
export const GET: APIRoute = async ({ params, url, locals }) => {
  const access = await getReaderAccess(locals.supabase, params.slug ?? '', params.n ?? '', readerViewer(locals.user, locals.profile));
  if (!access) return reply(404, { error: 'No encontrado.' });
  if (access.state !== 'ready') {
    const [status, error] = REFUSED[access.state];
    return reply(status, { error });
  }

  const pages = access.unit.pages!; // 'ready' means the unit is stored by pages
  const from = intParam(url, 'from', 0), count = intParam(url, 'count', PAGE_BATCH);
  if (!(from < pages.length) || !(count >= 1)) return reply(400, { error: 'Página fuera de rango.' });
  const signed = await signPages(locals.supabase, access.unit, from, Math.min(count, PAGE_BATCH_MAX));
  return signed ? reply(200, { count: pages.length, from, pages: signed }) : reply(502, { error: 'No se pudieron preparar los enlaces.' });
};
