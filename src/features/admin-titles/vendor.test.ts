import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// public/vendor/libarchive is served as-is (the worker finds its wasm next to itself), so it must
// match the installed libarchive.js. After upgrading it, copy dist/worker-bundle.js and dist/libarchive.wasm again.
describe('vendored libarchive.js worker', () => {
  it.each(['worker-bundle.js', 'libarchive.wasm'])('%s matches node_modules', (file) => {
    expect(readFileSync(`public/vendor/libarchive/${file}`).equals(readFileSync(`node_modules/libarchive.js/dist/${file}`))).toBe(true);
  });
});
