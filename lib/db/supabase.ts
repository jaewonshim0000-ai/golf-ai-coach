import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase wiring.
 *
 * The repository requires a configured connection unless demo mode is
 * explicitly enabled. Never silently send real players into shared demo data.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function browserClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}

/** The client library already retries reads on 503, 520 and network failure. */
const GATEWAY_ERRORS = new Set([500, 502, 504]);

/**
 * Retry reads on the gateway errors the client library passes straight
 * through. One such reply, with an empty body, failed a production page.
 * Writes are never repeated.
 */
export function retryReads(base: typeof fetch, delayMs = 250): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    for (let attempt = 1; ; attempt++) {
      const response = await base(input, init);
      if (attempt >= 3 || (method !== "GET" && method !== "HEAD") || !GATEWAY_ERRORS.has(response.status)) return response;
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  };
}

type CookieStore = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: Record<string, unknown>): void;
  setAll?(values: { name: string; value: string; options: Record<string, unknown> }[]): void;
};

/**
 * Server client. `cookies()` is passed in rather than imported so this module
 * stays usable from route handlers, server actions and middleware alike.
 */
export function serverClient(store: CookieStore): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createServerClient(url, anonKey, {
    global: { fetch: retryReads((input, init) => fetch(input, init)) },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          if (store.setAll) { store.setAll(cookiesToSet); return; }
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options as Record<string, unknown>);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session instead.
        }
      },
    },
  });
}
