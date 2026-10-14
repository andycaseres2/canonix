/** Picking and typing the pages inside a comic archive (CBZ/CBR). Shared by the viewer, the uploader and tests. */
import { PAGE_TYPES as TYPES } from '../../lib/uploads';

const extension = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export const imageType = (name: string) => TYPES[extension(name)] ?? 'application/octet-stream';

/** Image entries in reading order: natural sort (2 before 10), skipping folders, hidden files and macOS metadata. */
export function comicPages(names: string[]) {
  return names
    .filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'))
    .filter((n) => !n.split('/').pop()!.startsWith('.') && extension(n) in TYPES)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }));
}
