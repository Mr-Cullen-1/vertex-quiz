import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Refreshes the Supabase auth session cookie on every request, called from
 * the root `proxy.ts`. This is optimistic/cheap (cookie-only) — it must not
 * be the only thing protecting teacher data. Real authorization happens at
 * the data layer via Row Level Security and `src/lib/supabase/server.ts`.
 *
 * No-ops (passes the request through unchanged) when Supabase isn't
 * configured yet, so the app keeps working before real credentials exist —
 * see docs/development-progress.md, Phase 1.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, headerValue] of Object.entries(headers)) {
            response.headers.set(key, headerValue);
          }
        },
      },
    }
  );

  // Triggers a token refresh if the current session is stale, before any
  // route code runs downstream.
  await supabase.auth.getClaims();

  return response;
}
