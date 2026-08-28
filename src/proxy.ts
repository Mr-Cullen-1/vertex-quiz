import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request (see `matcher` below) to keep the Supabase auth
 * cookie fresh and perform optimistic route redirects. Next.js 16 renamed
 * `middleware.ts`/`middleware` to `proxy.ts`/`proxy` — see CLAUDE.md §4.
 *
 * This is an *optimistic* check only (cookie-derived claims, no DB call) —
 * per the Next.js Data Access Layer guidance, it is not the only thing
 * protecting teacher data. The `(admin)` layout re-verifies auth
 * server-side on every request regardless of what happens here, and every
 * table is additionally scoped by Row Level Security.
 */
const PROTECTED_PATHS = ["/dashboard", "/quizzes", "/results", "/settings"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !claims) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && claims) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
