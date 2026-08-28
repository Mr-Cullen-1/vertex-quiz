import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions, and Route
 * Handlers. Bound to the request's cookies, so every query runs as the
 * signed-in teacher and is subject to Row Level Security — this is the
 * client teacher-facing code should use by default.
 *
 * Not for student-facing code: students never authenticate with Supabase,
 * so RLS has nothing to key ownership off for them. Use
 * `createAdminClient()` from `./admin` there instead.
 */
export async function createClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which can't set cookies on
            // the response. Safe to ignore: the session-refresh proxy
            // (proxy.ts) already keeps the auth cookie in sync on every
            // request, and Server Actions/Route Handlers can set cookies
            // just fine when a refresh actually needs to be persisted.
          }
        },
      },
    }
  );
}
