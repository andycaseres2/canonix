// CBR (RAR) to CBZ (ZIP) in the browser, so storage and the reader only deal with CBZ.
import { comicPages } from '../../reader/pages';

/** Served from public/ so its worker can load libarchive.wasm from the same folder. */
const WORKER_URL = '/vendor/libarchive/worker-bundle.js';

export const isCbr = (file: File) => /\.cbr$/i.test(file.name);

/** Unpacks the archive (RAR, or a ZIP renamed to .cbr) and repacks its pages, uncompressed, as a .cbz. */
export async function cbrToCbz(file: File): Promise<File> {
  const [{ Archive }, { zipSync }] = await Promise.all([import('libarchive.js'), import('fflate')]);
  Archive.init({ workerUrl: WORKER_URL });
  const archive = await Archive.open(file);
  try {
    await archive.extractFiles();
    const entries = (await archive.getFilesArray()) as { file: File; path: string }[];
    const byName = new Map(entries.map((e) => [`${e.path}${e.file.name}`, e.file]));
    const pages = comicPages([...byName.keys()]);
    if (!pages.length) throw new Error('El CBR no tiene imágenes.');
    const zip: Record<string, Uint8Array> = {};
    for (const name of pages) zip[name] = new Uint8Array(await byName.get(name)!.arrayBuffer());
    // Pages are already compressed images: store them as they are
    return new File([zipSync(zip, { level: 0 }) as BlobPart], file.name.replace(/\.cbr$/i, '.cbz'), { type: 'application/vnd.comicbook+zip' });
  } catch (e) {
    throw new Error(e instanceof Error && e.message.startsWith('El CBR') ? e.message : 'No se pudo convertir el CBR. ¿Está dañado o tiene contraseña?');
  } finally {
    await archive.close();
  }
}
