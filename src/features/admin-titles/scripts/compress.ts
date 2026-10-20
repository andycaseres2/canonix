// Shrinks images in the admin's browser before they are uploaded: re-encoded as WebP (JPEG where the browser cannot write WebP)
// at a quality where comic art looks the same, and never larger than the reader needs. A file that would not get smaller is kept as is.
import { mapLimit } from '../../../lib/uploads';
import type { Page } from './archive';
import { QUALITY, chooseSmaller, fitSize, paint } from './compress.worker';

export { chooseSmaller, fitSize };

/** Pages stay sharp with the reader's 2x zoom; covers are only shown small. */
export const PAGE_MAX_SIDE = 3200;
export const COVER_MAX_SIDE = 1600;
/** Pages compressed at once, on as many workers. */
const PAGES_AT_ONCE = 3;
const EXTENSIONS: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' };

/** "007.png" as a WebP is "007.webp": same number, the extension of its new type. */
export const renameFor = (name: string, type: string) => (EXTENSIONS[type] ? name.replace(/\.[a-z0-9]+$/i, `.${EXTENSIONS[type]}`) : name);

let webp: boolean | undefined;
/** Safari reads WebP but cannot write it (its canvas falls back to PNG), so there JPEG is used instead. */
const canWriteWebp = () => (webp ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).toDataURL('image/webp').startsWith('data:image/webp'));

/** Draws a picture (or a rendered canvas) at most `maxSide` on its long side and encodes it. Null when the browser could not. */
export async function encodeImage(source: CanvasImageSource, width: number, height: number, maxSide: number): Promise<Blob | null> {
  const size = fitSize(width, height, maxSide);
  const canvas = Object.assign(document.createElement('canvas'), size);
  const g = canvas.getContext('2d');
  if (!g) return null;
  paint(g, source, size);
  const type = canWriteWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  canvas.width = canvas.height = 0;
  return blob?.type === type ? blob : null;
}

/** An image compressed for upload. GIFs (they may be animated) and images the browser cannot open are kept as they are. */
export async function compressImage(file: Blob, maxSide = PAGE_MAX_SIDE): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  try {
    return chooseSmaller(file, await encodeImage(bitmap, bitmap.width, bitmap.height, maxSide));
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

type CompressWorker = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener'>;

/**
 * Compresses pages on up to `size` workers, started only when needed. An image goes to `fallback` (the main thread) when a
 * worker cannot be started or fails, and so does every image after that: the worker never makes an upload fail.
 */
export function workerPool(spawn: () => CompressWorker, size: number, fallback: (blob: Blob) => Promise<Blob>, maxSide = PAGE_MAX_SIDE) {
  const workers: CompressWorker[] = [];
  const pending = new Map<number, { blob: Blob; resolve: (blob: Blob | Promise<Blob>) => void }>();
  let nextId = 0, broken = false;
  const fail = () => {
    broken = true;
    for (const [id, job] of pending) { pending.delete(id); job.resolve(fallback(job.blob)); }
  };
  const start = () => {
    const w = spawn();
    w.addEventListener('message', ({ data }: MessageEvent<{ id: number; blob: Blob }>) => {
      const job = pending.get(data.id);
      if (job) { pending.delete(data.id); job.resolve(data.blob); }
    });
    w.addEventListener('error', fail);
    w.addEventListener('messageerror', fail);
    return w;
  };
  return {
    compress(blob: Blob): Promise<Blob> {
      if (broken) return fallback(blob);
      const id = nextId++;
      let worker: CompressWorker;
      try {
        worker = workers.length < size ? workers[workers.push(start()) - 1] : workers[id % size];
      } catch {
        broken = true;
        return fallback(blob);
      }
      return new Promise((resolve) => {
        pending.set(id, { blob, resolve });
        worker.postMessage({ id, blob, maxSide });
      });
    },
    close() { for (const w of workers.splice(0)) w.terminate(); },
  };
}

/** Workers that can draw (OffscreenCanvas): every browser the admin uses today, except older Safari. */
const canUseWorkers = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
const spawnWorker = () => new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });

/** A comic's pages compressed a few at a time (there can be hundreds of large ones), in order and renamed after their new type. */
export async function compressPages(pages: Page[], onPage: (done: number, total: number) => void = () => {}, compress?: (blob: Blob) => Promise<Blob>): Promise<Page[]> {
  // By default off the main thread, so the screen stays fluid; the workers live only for this batch
  const pool = !compress && canUseWorkers() ? workerPool(spawnWorker, PAGES_AT_ONCE, (b) => compressImage(b)) : null;
  const run = compress ?? pool?.compress ?? ((b: Blob) => compressImage(b));
  let done = 0;
  try {
    return await mapLimit(pages, PAGES_AT_ONCE, async (p) => {
      const blob = await run(p.blob);
      onPage(++done, pages.length);
      // By type, not identity: a worker hands back a copy even of an original it kept
      return { name: blob.type === p.blob.type ? p.name : renameFor(p.name, blob.type), blob };
    });
  } finally {
    pool?.close();
  }
}

/** A cover compressed for upload, as a file named after its new type. */
export async function compressCover(file: File, compress: (blob: Blob) => Promise<Blob> = (b) => compressImage(b, COVER_MAX_SIDE)): Promise<File> {
  const blob = await compress(file);
  return blob === file ? file : new File([blob], renameFor(file.name, blob.type), { type: blob.type });
}
