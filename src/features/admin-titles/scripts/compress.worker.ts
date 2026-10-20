// Compresses comic pages off the main thread, so a 200-page upload leaves the admin's screen fluid. Same rules as compress.ts.
// It also holds the rules both paths share: a module this worker imports must not start the worker itself (Vite refuses
// circular worker imports), so compress.ts imports them from here and not the other way round. No DOM in here.

export const QUALITY = 0.85;
/** The compressed file must save at least this share of the original, or the original is kept. */
const MIN_SAVING = 0.1;

/** The size an image is drawn at: its long side at most `maxSide`, proportions kept, never enlarged. */
export function fitSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const chooseSmaller = (original: Blob, encoded: Blob | null) =>
  encoded && encoded.size <= original.size * (1 - MIN_SAVING) ? encoded : original;

/** Draws a picture over white at the given size (on a page or an offscreen canvas alike). */
export function paint(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, source: CanvasImageSource, size: { width: number; height: number }) {
  // Transparent areas turn white, as on paper (JPEG has no transparency)
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size.width, size.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, size.width, size.height);
}

/** Encodes as WebP, or as JPEG where the browser cannot write WebP (Safari falls back to PNG). Null when it could not. */
async function encode(canvas: OffscreenCanvas): Promise<Blob | null> {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
  if (webp.type === 'image/webp') return webp;
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  return jpeg.type === 'image/jpeg' ? jpeg : null;
}

/** compressImage's twin on an OffscreenCanvas: GIFs and images the browser cannot open are kept as they are. */
async function compressOffscreen(file: Blob, maxSide: number): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }
  try {
    const size = fitSize(bitmap.width, bitmap.height, maxSide);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const g = canvas.getContext('2d');
    if (!g) return file;
    paint(g, bitmap, size);
    return chooseSmaller(file, await encode(canvas));
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

// Only answer jobs when actually running as a worker; the main thread imports this file for the shared rules above
if ('WorkerGlobalScope' in globalThis) {
  self.addEventListener('message', async (e: MessageEvent<{ id: number; blob: Blob; maxSide: number }>) => {
    const { id, blob, maxSide } = e.data;
    self.postMessage({ id, blob: await compressOffscreen(blob, maxSide) });
  });
}
