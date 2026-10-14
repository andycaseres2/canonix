import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** Every page, component and script under src/, read straight from disk (not through Vite). */
function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(astro|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

// A call like confirm('…') or alert(x), but not a method signature such as `confirm(o: Options)`
const NATIVE_CALL = /(^|[^.\w])(confirm|alert)\((?!\s*\w+\??\s*:)/;

describe('native browser dialogs', () => {
  it('the guard tells calls from type signatures', () => {
    expect(NATIVE_CALL.test(`onsubmit="return confirm('¿Seguro?')"`)).toBe(true);
    expect(NATIVE_CALL.test('  alert(message);')).toBe(true);
    expect(NATIVE_CALL.test('  confirm(o: { title?: string }): Promise<boolean>;')).toBe(false);
    expect(NATIVE_CALL.test('appDialog().confirm({ message })')).toBe(false);
  });

  it('no page or script calls window confirm() or alert(); they use the app dialog', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, i) => (NATIVE_CALL.test(line) ? [`${file.slice(SRC.length + 1)}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
