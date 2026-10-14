import { describe, expect, it, vi } from 'vitest';
import { PUT } from '../pages/api/mock-storage/upload';
import { GET } from '../pages/api/mock-storage/object';
import { createMockClient } from './mock/client';
import { ADMIN, memorySession } from './mock/fixture';
import { getDemoDb } from './mock/seed';

const admin = () => createMockClient(getDemoDb(), memorySession(ADMIN));
const put = (url: string, body: string, type: string) =>
  PUT({ request: new Request(`http://x${url}`, { method: 'PUT', body, headers: { 'Content-Type': type } }), url: new URL(`http://x${url}`) } as any) as Promise<Response>;
const get = (url: string) => GET({ url: new URL(`http://x${url}`) } as any) as Promise<Response>;

describe('mock storage endpoints', () => {
  it('stores a signed upload and serves a public cover', async () => {
    const sb = admin().storage.from('covers');
    const { data } = await sb.createSignedUploadUrl('t1/cover.png');
    expect((await put(data!.signedUrl, 'png-bytes', 'image/png')).status).toBe(200);
    const res = await get(sb.getPublicUrl('t1/cover.png').data.publicUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(await res.text()).toBe('png-bytes');
  });

  it('rejects a reused token and a disallowed type', async () => {
    const sb = admin().storage.from('covers');
    const { data } = await sb.createSignedUploadUrl('t2/cover.png');
    expect((await put(data!.signedUrl, 'a', 'text/plain')).status).toBe(400);
    expect((await put(data!.signedUrl, 'a', 'image/png')).status).toBe(400);
  });

  it('private content needs a valid signed url', async () => {
    const sb = admin().storage.from('content');
    const { data: up } = await sb.createSignedUploadUrl('t3/1.cbz');
    await put(up!.signedUrl, 'zip', 'application/zip');
    expect((await get('/api/mock-storage/object?bucket=content&path=t3%2F1.cbz')).status).toBe(403);
    const { data } = await sb.createSignedUrl('t3/1.cbz', 60);
    expect((await get(data!.signedUrl)).status).toBe(200);
    expect((await get('/api/mock-storage/object?bucket=covers&path=missing.png')).status).toBe(404);
  });

  it('both endpoints are 404 when the mock is off', async () => {
    vi.resetModules();
    vi.doMock('./config', () => ({ USE_MOCK: false }));
    const { PUT: put2 } = await import('../pages/api/mock-storage/upload');
    const { GET: get2 } = await import('../pages/api/mock-storage/object');
    const url = new URL('http://x/api/mock-storage/object?bucket=covers&path=a.png');
    expect(((await get2({ url } as any)) as Response).status).toBe(404);
    expect(((await put2({ url, request: new Request(url, { method: 'PUT', body: 'x' }) } as any)) as Response).status).toBe(404);
    vi.doUnmock('./config');
  });
});
