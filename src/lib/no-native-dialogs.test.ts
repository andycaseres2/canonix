import { describe, expect, it } from 'vitest';

// Every page, component and script under src/, as raw text
const sources = import.meta.glob<string>(['../**/*.astro', '../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('native browser dialogs', () => {
  it('no page or script calls window confirm() or alert(); they use the app dialog', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources).flatMap(([file, text]) =>
      text.split('\n').flatMap((line, i) => (/(^|[^.\w])(confirm|alert)\(/.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
