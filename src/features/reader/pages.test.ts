import { describe, expect, it } from 'vitest';
import { comicPages, imageType } from './pages';

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
