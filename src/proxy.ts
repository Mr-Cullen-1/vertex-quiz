import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Runs on every request (see `matcher` below) to keep the Supabase auth
 * cookie fresh. Next.js 16 renamed `middleware.ts`/`middleware` to
 * `proxy.ts`/`proxy` — see CLAUDE.md §4.
 *
 * This performs no route protection by itself (there are no protected
 * routes yet — the (admin) route group arrives in Phase 2). Real
 * authorization always happens server-side at the data layer via RLS.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
