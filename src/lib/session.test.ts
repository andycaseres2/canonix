import { describe, expect, it } from 'vitest';
import { hasSessionCookie } from './session';

describe('hasSessionCookie', () => {
  it('is false without cookies or with unrelated cookies', () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie('')).toBe(false);
    expect(hasSessionCookie('theme=dark; _ga=GA1.2.3')).toBe(false);
    expect(hasSessionCookie('sb-abc-auth-token-code-verifier=x')).toBe(false);
  });

  it('detects the Supabase auth cookie, chunked or not', () => {
    expect(hasSessionCookie('sb-abcd1234-auth-token=base64-xyz')).toBe(true);
    expect(hasSessionCookie('theme=dark; sb-abcd1234-auth-token.0=part; sb-abcd1234-auth-token.1=part')).toBe(true);
  });
});
