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
