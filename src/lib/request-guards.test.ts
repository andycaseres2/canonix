import { describe, expect, it } from 'vitest';
import { POST as login } from '../pages/api/auth/login';
import { fixture, as } from '../test/mock/fixture';
import { isForeignWrite, safeNext } from './request-guards';

const SITE = 'http://x';

describe('safeNext', () => {
  it.each([
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/foo\\bar',
    'https://evil.com',
    'javascript:alert(1)',
    'evil.com',
    '/\tevil.com',
    '/\revil',
    '/\nevil',
    '/%2F/evil.com',
    '/%2f%2fevil.com',
    '/%5Cevil.com',
    '/%5cevil.com',
    '/%09/evil.com',
    '/%0d%0aSet-Cookie:x=1',
    '/%252F%252Fevil.com',
    '/%E0%A4%A',
    '',
  ])('rejects %j and falls back to /', (input) => {
    expect(safeNext(input)).toBe('/');
  });

  it('rejects anything that is not a string', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });

  it.each(['/', '/rutas', '/perfil', '/leer/asm/3?p=2', '/catalogo?kind=manga&q=x%20y', '/rutas/free#etapa-2'])('keeps the same-site path %j', (input) => {
    expect(safeNext(input)).toBe(input);
  });
});

async function postLogin(fields: Record<string, string>) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.set(k, v));
  const request = new Request(`${SITE}/api/auth/login`, { method: 'POST', body });
  const res: Response = await login({
    request, url: new URL(request.url), locals: { supabase: as(fixture(), null) },
    redirect: (to: string) => new Response(null, { status: 302, headers: { Location: to } }),
  } as any);
  return res.headers.get('Location');
}

describe('POST /api/auth/login next', () => {
  it('redirects to a same-site next with its query after signing in', async () => {
    expect(await postLogin({ email: 'lector@demo.com', password: 'demo1234', next: '/leer/asm/1?p=3' })).toBe('/leer/asm/1?p=3');
  });

  it('falls back to / for a crafted next', async () => {
    expect(await postLogin({ email: 'lector@demo.com', password: 'demo1234', next: '/\\evil.com' })).toBe('/');
  });

  it('keeps only a safe next on the error redirect', async () => {
    const to = new URL((await postLogin({ email: 'lector@demo.com', password: 'mal', next: '/%2F/evil.com' }))!, SITE);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('error')).toBe('Correo o contraseña incorrectos.');
    expect(to.searchParams.get('next')).toBe('/');
  });
});

describe('isForeignWrite', () => {
  const req = (method: string, path: string, headers: Record<string, string> = {}) =>
    new Request(`${SITE}${path}`, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : '{}' });

  it('refuses a cross-origin POST to /api, whatever the content type', () => {
    expect(isForeignWrite(req('POST', '/api/progress', { Origin: 'https://evil.com', 'Content-Type': 'application/json' }), new URL(`${SITE}/api/progress`))).toBe(true);
    expect(isForeignWrite(req('POST', '/api/progress', { Origin: 'https://evil.com', 'Content-Type': 'text/plain' }), new URL(`${SITE}/api/progress`))).toBe(true);
    expect(isForeignWrite(req('DELETE', '/api/admin/units', { Origin: 'http://x:8080' }), new URL(`${SITE}/api/admin/units`))).toBe(true);
  });

  it('lets a same-origin POST through', () => {
    expect(isForeignWrite(req('POST', '/api/progress', { Origin: SITE, 'Content-Type': 'application/json' }), new URL(`${SITE}/api/progress`))).toBe(false);
  });

  it('refuses a JSON POST with no Origin', () => {
    expect(isForeignWrite(req('POST', '/api/progress', { 'Content-Type': 'application/json; charset=utf-8' }), new URL(`${SITE}/api/progress`))).toBe(true);
  });

  it('leaves form posts with no Origin to Astro', () => {
    expect(isForeignWrite(req('POST', '/api/auth/login', { 'Content-Type': 'application/x-www-form-urlencoded' }), new URL(`${SITE}/api/auth/login`))).toBe(false);
  });

  it('never touches GET/HEAD or pages outside /api', () => {
    expect(isForeignWrite(req('GET', '/api/progress', { Origin: 'https://evil.com' }), new URL(`${SITE}/api/progress`))).toBe(false);
    expect(isForeignWrite(req('HEAD', '/api/progress', { Origin: 'https://evil.com' }), new URL(`${SITE}/api/progress`))).toBe(false);
    expect(isForeignWrite(req('POST', '/rutas', { Origin: 'https://evil.com', 'Content-Type': 'application/json' }), new URL(`${SITE}/rutas`))).toBe(false);
  });
});
