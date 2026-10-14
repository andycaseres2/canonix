/** Supabase SSR stores the session as sb-<ref>-auth-token, split into .0, .1… when large. */
const SUPABASE_AUTH_COOKIE = /^sb-[^=]+-auth-token(\.\d+)?$/;

/**
 * True when the request carries a session cookie. Without one there is nobody to
 * authenticate, so the middleware can skip the round trip to Supabase Auth.
 */
export function hasSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((pair) => {
    const name = pair.split('=')[0].trim();
    return SUPABASE_AUTH_COOKIE.test(name);
  });
}
