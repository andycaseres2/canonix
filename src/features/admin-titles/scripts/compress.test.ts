import { describe, expect, it } from 'vitest';
import { checkPages } from '../../../lib/uploads';
import { chooseSmaller, compressCover, compressPages, fitSize, renameFor, workerPool } from './compress';

const blob = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

describe('fitSize', () => {
  it('shrinks the long side to the limit and keeps the proportions', () => {
    expect(fitSize(4000, 6000, 3200)).toEqual({ width: 2133, height: 3200 });
    expect(fitSize(6400, 4000, 3200)).toEqual({ width: 3200, height: 2000 });
  });

  it('never enlarges an image already within the limit', () => {
    expect(fitSize(1988, 3056, 3200)).toEqual({ width: 1988, height: 3056 });
  });
});

describe('chooseSmaller', () => {
  it('keeps the compressed image when it saves at least 10%', () => {
    const original = blob(2_000_000, 'image/jpeg'), encoded = blob(500_000, 'image/webp');
    expect(chooseSmaller(original, encoded)).toBe(encoded);
  });

  it('keeps the original when compressing saves less than 10%, or failed', () => {
    const original = blob(1_000_000, 'image/jpeg');
    expect(chooseSmaller(original, blob(950_000, 'image/webp'))).toBe(original);
    expect(chooseSmaller(original, null)).toBe(original);
  });
});

describe('renameFor', () => {
  it('gives the page the extension of its new type, keeping its number', () => {
    expect(renameFor('007.png', 'image/webp')).toBe('007.webp');
    expect(renameFor('0123.jpeg', 'image/jpeg')).toBe('0123.jpg');
    expect(renameFor('001.gif', 'image/gif')).toBe('001.gif');
  });
});

describe('compressPages', () => {
  it('compresses every page in order, renames it after its new type and reports progress', async () => {
    const pages = [{ name: '001.png', blob: blob(10, 'image/png') }, { name: '002.jpg', blob: blob(10, 'image/jpeg') }];
    const progress: string[] = [];
    const out = await compressPages(pages, (done, total) => progress.push(`${done}/${total}`), async () => blob(3, 'image/webp'));
    expect(out.map((p) => [p.name, p.blob.type, p.blob.size])).toEqual([['001.webp', 'image/webp', 3], ['002.webp', 'image/webp', 3]]);
    expect(progress).toEqual(['1/2', '2/2']);
  });

  it('keeps the name of a page that was left as it was', async () => {
    const page = { name: '001.gif', blob: blob(10, 'image/gif') };
    const [out] = await compressPages([page], () => {}, async (b) => b);
    expect(out).toEqual(page);
  });

  it('keeps the name when the original comes back as a copy, as it does from a worker', async () => {
    const page = { name: '001.jpeg', blob: blob(10, 'image/jpeg') };
    const [out] = await compressPages([page], () => {}, async (b) => b.slice(0, b.size, b.type));
    expect(out.name).toBe('001.jpeg');
  });

  it('produces page names and types the upload endpoint accepts', async () => {
    const out = await compressPages([{ name: '001.png', blob: blob(10, 'image/png') }], () => {}, async () => blob(3, 'image/webp'));
    expect(checkPages(out.map((p) => ({ name: p.name, content_type: p.blob.type, size: p.blob.size })))).toEqual({
      pages: [{ name: '001.webp', content_type: 'image/webp', size: 3 }],
    });
  });
});

describe('compressCover', () => {
  it('returns the compressed cover as a file named after its new type', async () => {
    const cover = new File([new Uint8Array(10)], 'Portada Final.PNG', { type: 'image/png' });
    const out = await compressCover(cover, async () => blob(3, 'image/webp'));
    expect([out.name, out.type, out.size]).toEqual(['Portada Final.webp', 'image/webp', 3]);
  });

  it('returns the same file when it was not compressed', async () => {
    const cover = new File([new Uint8Array(10)], 'a.gif', { type: 'image/gif' });
    expect(await compressCover(cover, async (b) => b)).toBe(cover);
  });
});

/** A stand-in for a compression worker: answers each job with a 3-byte WebP, or never answers when told to fail. */
class FakeWorker {
  jobs: { id: number; blob: Blob; maxSide: number }[] = [];
  terminated = false;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(private reply = true) {}
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  postMessage(job: { id: number; blob: Blob; maxSide: number }) {
    this.jobs.push(job);
    if (this.reply) queueMicrotask(() => this.emit('message', { data: { id: job.id, blob: blob(3, 'image/webp') } }));
  }
  emit(type: string, e: unknown) { for (const fn of this.listeners[type] ?? []) fn(e); }
  terminate() { this.terminated = true; }
}

describe('workerPool', () => {
  const mainThread = async (b: Blob) => blob(b.size - 1, 'image/jpeg');

  it('compresses on workers started only as needed, up to the pool size, at the page size limit', async () => {
    const started: FakeWorker[] = [];
    const pool = workerPool(() => { const w = new FakeWorker(); started.push(w); return w; }, 3, mainThread);
    expect(started).toHaveLength(0);
    const out = await Promise.all([1, 2, 3, 4].map(() => pool.compress(blob(10, 'image/png'))));
    expect(out.map((b) => b.type)).toEqual(['image/webp', 'image/webp', 'image/webp', 'image/webp']);
    expect(started).toHaveLength(3);
    expect(started.flatMap((w) => w.jobs.map((j) => j.maxSide))).toEqual([3200, 3200, 3200, 3200]);
  });

  it('terminates every worker when closed', async () => {
    const started: FakeWorker[] = [];
    const pool = workerPool(() => { const w = new FakeWorker(); started.push(w); return w; }, 3, mainThread);
    await Promise.all([pool.compress(blob(10, 'image/png')), pool.compress(blob(10, 'image/png'))]);
    pool.close();
    expect(started.map((w) => w.terminated)).toEqual([true, true]);
  });

  it('compresses on the main thread when a worker cannot be started', async () => {
    const pool = workerPool(() => { throw new Error('no workers'); }, 3, mainThread);
    const out = await pool.compress(blob(10, 'image/png'));
    expect([out.type, out.size]).toEqual(['image/jpeg', 9]);
  });

  it('compresses on the main thread the images a failed worker held, and every image after it', async () => {
    const worker = new FakeWorker(false);
    let spawned = 0;
    const pool = workerPool(() => { spawned++; return worker; }, 1, mainThread);
    const held = pool.compress(blob(10, 'image/png'));
    worker.emit('error', new Event('error'));
    expect((await held).type).toBe('image/jpeg');
    expect((await pool.compress(blob(20, 'image/png'))).size).toBe(19);
    expect(spawned).toBe(1);
  });
});

describe('compressPages without a compressor given', () => {
  it('keeps every page as it is where the browser cannot open images (no workers, no canvas)', async () => {
    const pages = [{ name: '001.png', blob: blob(10, 'image/png') }];
    expect(await compressPages(pages)).toEqual(pages);
  });
});
