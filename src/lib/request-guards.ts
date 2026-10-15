/** Checks on where a request comes from and where it may send the visitor. */

const UNSAFE_PATH = /[\\\x00-\x1f\x7f]/;

/**
 * `next` only when it is a path on this site, `fallback` otherwise. Rejects "//host", "/\host",
 * any backslash, schemes and control characters, raw or percent-encoded (even more than once).
 */
export function safeNext(next: unknown, fallback = '/') {
  if (typeof next !== 'string') return fallback;
  let s = next;
  for (let i = 0; i < 5; i++) {
    if (!s.startsWith('/') || s.startsWith('//') || UNSAFE_PATH.test(s)) return fallback;
    let decoded: string;
    try { decoded = decodeURIComponent(s); } catch { return fallback; }
    if (decoded === s) break;
    s = decoded;
  }
  // Belt and braces: the browser must resolve it to this same origin
  const base = 'http://same.invalid';
  return new URL(next, base).origin === base ? next : fallback;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * True for a write to /api/* that another site could have sent. Astro's checkOrigin only covers form
 * content types, so this refuses any foreign Origin, and JSON bodies without an Origin (browsers always
 * send one on fetch POSTs). Form posts without an Origin are left to Astro.
 */
export function isForeignWrite(request: Request, url: URL) {
  if (SAFE_METHODS.has(request.method) || !url.pathname.startsWith('/api/')) return false;
  const origin = request.headers.get('Origin');
  if (origin) return origin !== url.origin;
  return (request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json');
}
