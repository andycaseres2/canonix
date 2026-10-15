import { describe, expect, it, vi } from 'vitest';
import { fixture, as } from './test/mock/fixture';

vi.mock('astro:middleware', () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock('./lib/supabase', () => ({ createSupabase: () => as(fixture(), null) }));

const { onRequest } = await import('./middleware');

async function run(method: string, path: string, headers: Record<string, string> = {}) {
  const request = new Request(`http://x${path}`, { method, headers, body: method === 'GET' ? undefined : '{}' });
  const next = vi.fn(async () => new Response('ok'));
  const context = { request, url: new URL(request.url), cookies: {}, locals: {}, redirect: (to: string) => Response.redirect(`http://x${to}`, 302) };
  const res = (await (onRequest as any)(context, next)) as Response;
  return { res, next };
}

describe('middleware origin guard', () => {
  it('refuses a cross-origin JSON POST to /api/progress before the endpoint runs', async () => {
    const { res, next } = await run('POST', '/api/progress', { Origin: 'https://evil.com', 'Content-Type': 'application/json' });
    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a JSON POST with no Origin', async () => {
    const { res, next } = await run('POST', '/api/progress', { 'Content-Type': 'application/json' });
    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a same-origin JSON POST on to the endpoint', async () => {
    const { res, next } = await run('POST', '/api/progress', { Origin: 'http://x', 'Content-Type': 'application/json' });
    expect(next).toHaveBeenCalledOnce();
    expect(await res.text()).toBe('ok');
  });

  it('leaves GET requests alone', async () => {
    const { res, next } = await run('GET', '/api/progress', { Origin: 'https://evil.com' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('still keeps signed-out visitors out of the admin API', async () => {
    const { res, next } = await run('POST', '/api/admin/units', { Origin: 'http://x', 'Content-Type': 'application/json' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('No autorizado');
    expect(next).not.toHaveBeenCalled();
  });
});
