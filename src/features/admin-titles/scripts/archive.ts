// Opens a CBZ/CBR in the admin's browser and returns its pages, so a comic is stored one image per page.
import { imageType, numberPages } from '../../reader/pages';

/** Served from public/ so its worker can load libarchive.wasm from the same folder. */
const LIBARCHIVE_WORKER = '/vendor/libarchive/worker-bundle.js';

export type Page = { name: string; blob: Blob };

export const isComicArchive = (file: File) => /\.(cbz|cbr)$/i.test(file.name);

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
