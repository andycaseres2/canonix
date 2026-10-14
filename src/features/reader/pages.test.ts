import { describe, expect, it } from 'vitest';
import { comicPages, imageType, numberPages } from './pages';

describe('comicPages', () => {
  it('keeps only images, in natural order, wherever they sit in the archive', () => {
    expect(comicPages([
      'FF 001/FF-001-10.jpg', 'FF 001/FF-001-2.jpg', 'FF 001/FF-001-1.JPG', 'FF 001/', 'FF 001/ComicInfo.xml',
      '__MACOSX/FF 001/._FF-001-1.jpg', 'FF 001/.DS_Store', 'FF 001/Thumbs.db', 'cover.webp', 'notes.txt',
    ])).toEqual(['cover.webp', 'FF 001/FF-001-1.JPG', 'FF 001/FF-001-2.jpg', 'FF 001/FF-001-10.jpg']);
  });

  it('returns an empty list for an archive without images', () => {
    expect(comicPages(['readme.txt', 'ComicInfo.xml'])).toEqual([]);
  });
});

describe('imageType', () => {
  it('maps page extensions to their content type', () => {
    expect(['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.gif', 'a.avif'].map(imageType))
      .toEqual(['image/jpeg', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
  });
});

describe('numberPages', () => {
  it('names the pages in reading order, keeping each extension in lower case', () => {
    expect(numberPages(['FF/b-2.JPG', 'FF/b-10.png', '__MACOSX/x.jpg', 'FF/b-1.jpeg', 'info.txt'])).toEqual([
      { from: 'FF/b-1.jpeg', name: '001.jpeg' }, { from: 'FF/b-2.JPG', name: '002.jpg' }, { from: 'FF/b-10.png', name: '003.png' },
    ]);
  });

  it('pads to four digits past 999 pages', () => {
    const names = Array.from({ length: 1000 }, (_, i) => `p${i + 1}.webp`);
    expect(numberPages(names).at(-1)).toEqual({ from: 'p1000.webp', name: '1000.webp' });
    expect(numberPages(names)[0].name).toBe('0001.webp');
  });
});
