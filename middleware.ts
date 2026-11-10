import { NextResponse, type NextRequest } from "next/server";

import { serverClient, supabaseConfigured } from "@/lib/db/supabase";

/**
 * Refreshes the Supabase session cookie on every request so Server Components
 * always see a valid session. A no-op in demo mode.
 *
 * `getSession()` refreshes an expiring token exactly as `getUser()` does, but
 * skips asking Supabase Auth who the user is. Nothing here decides access: the
 * pages and actions do, with `getUser()` in `repo.currentUser()`. Asking here
 * too added a round trip to every page, prefetch and action.
 */
export async function middleware(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = serverClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      response.cookies.set(name, value, options);
    },
    setAll: (values) => {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
    },
  });
  await supabase?.auth.getSession();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
