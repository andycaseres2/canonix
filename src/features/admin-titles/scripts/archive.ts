// Opens a CBZ/CBR/PDF in the admin's browser and returns its pages, so a comic is stored one image per page.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { imageType, numberPages } from '../../reader/pages';

/** Served from public/ so its worker can load libarchive.wasm from the same folder. */
const LIBARCHIVE_WORKER = '/vendor/libarchive/worker-bundle.js';

export type Page = { name: string; blob: Blob };

export const isComicArchive = (file: File) => /\.(cbz|cbr)$/i.test(file.name);
/** Files the uploader splits into pages before uploading: archives are unpacked, PDFs are drawn page by page. */
export const isPagedSource = (file: File) => isComicArchive(file) || /\.pdf$/i.test(file.name);

/** PDF pages are drawn this tall: sharp with the reader's 2x zoom, about 0.5–1.5 MB as JPEG. */
const PDF_PAGE_HEIGHT = 2000;
const PDF_JPEG_QUALITY = 0.85;

/**
 * A PDF's pages drawn one at a time as JPEG images, named "001.jpg", "002.jpg"…, so a big PDF is stored as
 * small files (Storage limits the size of each file). `onPage` reports how many pages are done.
 */
export async function renderPdfPages(file: File, onPage: (done: number, total: number) => void = () => {}): Promise<Page[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    await task.destroy();
    throw new Error('No se pudo abrir el PDF. ¿Está dañado o tiene contraseña?');
  }
  try {
    if (!doc.numPages) throw new Error('El PDF no tiene páginas.');
    const digits = Math.max(3, String(doc.numPages).length);
    const pages: Page[] = [];
    const canvas = document.createElement('canvas');
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // Never upscale a page more than 3x, nor make it wider than 3000px
      const scale = Math.min(PDF_PAGE_HEIGHT / base.height, 3000 / base.width, 3);
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PDF_JPEG_QUALITY));
      page.cleanup();
      if (!blob) throw new Error(`No se pudo convertir la página ${n} del PDF.`);
      pages.push({ name: `${String(n).padStart(digits, '0')}.jpg`, blob });
      onPage(n, doc.numPages);
    }
    canvas.width = canvas.height = 0;
    return pages;
  } finally {
    await task.destroy();
  }
}

async function unzipEntries(file: File) {
  const { unzip } = await import('fflate');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(bytes, (err, data) => (err ? reject(err) : resolve(data))));
  return new Map(Object.entries(files).map(([name, data]) => [name, new Blob([data as BlobPart])]));
}

async function unrarEntries(file: File) {
  const { Archive } = await import('libarchive.js');
  Archive.init({ workerUrl: LIBARCHIVE_WORKER });
  const archive = await Archive.open(file);
  try {
    await archive.extractFiles();
    const entries = (await archive.getFilesArray()) as { file: File; path: string }[];
    return new Map<string, Blob>(entries.map((e) => [`${e.path}${e.file.name}`, e.file]));
  } finally {
    await archive.close();
  }
}

/**
 * The comic's pages in reading order, named "001.jpg", "002.jpg"… Original image bytes, no recompression.
 * A .cbz is read as ZIP and a .cbr as RAR; each falls back to the other because files are often mislabeled.
 */
export async function extractPages(file: File): Promise<Page[]> {
  const [first, second] = /\.cbr$/i.test(file.name) ? [unrarEntries, unzipEntries] : [unzipEntries, unrarEntries];
  let entries: Map<string, Blob>;
  try {
    entries = await first(file);
  } catch {
    try { entries = await second(file); } catch { throw new Error('No se pudo abrir el archivo. ¿Está dañado o tiene contraseña?'); }
  }
  const pages = numberPages([...entries.keys()]);
  if (!pages.length) throw new Error('El archivo no tiene imágenes.');
  return pages.map((p) => ({ name: p.name, blob: new Blob([entries.get(p.from)!], { type: imageType(p.name) }) }));
}
