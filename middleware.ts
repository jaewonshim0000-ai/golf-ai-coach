import { NextResponse, type NextRequest } from "next/server";

import { serverClient, supabaseConfigured } from "@/lib/db/supabase";

/**
 * Refreshes the Supabase session cookie on every request so Server Components
 * always see a valid session. A no-op in demo mode.
 */
export async function middleware(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = serverClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      response.cookies.set(name, value, options);
    },
  });
  await supabase?.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
