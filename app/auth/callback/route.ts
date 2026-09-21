import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { serverClient } from "@/lib/db/supabase";

/** Exchanges the email-confirmation code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/practice";
  const destination = new URL(requestedNext, url.origin);
  const next = destination.origin === url.origin ? destination.pathname + destination.search : "/practice";

  if (code) {
    const supabase = serverClient(await cookies());
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
