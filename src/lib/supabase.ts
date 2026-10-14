import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { USE_MOCK } from './config';
import { createMockClient, createMockServiceClient } from './mock/client';
import { getDemoDb } from './mock/seed';
import { MOCK_SESSION_COOKIE } from './session';

export function createSupabase(request: Request, cookies: AstroCookies): SupabaseClient {
  if (USE_MOCK) {
    return createMockClient(getDemoDb(), {
      get: () => cookies.get(MOCK_SESSION_COOKIE)?.value ?? null,
      set: (id) => cookies.set(MOCK_SESSION_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax' }),
      clear: () => cookies.delete(MOCK_SESSION_COOKIE, { path: '/' }),
    });
  }
  return createServerClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(list) {
        list.forEach(({ name, value, options }) => cookies.set(name, value, options));
      },
    },
  });
}

/** Cliente con service role. Solo servidor y solo para acciones de admin sobre Auth. */
export function createServiceClient(): SupabaseClient | null {
  if (USE_MOCK) return createMockServiceClient(getDemoDb());
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
