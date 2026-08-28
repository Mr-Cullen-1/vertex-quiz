import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components (e.g. the teacher login form built
 * in Phase 2). Reads the public URL/publishable key directly from
 * `process.env.NEXT_PUBLIC_*` — these are inlined at build time and are
 * safe to ship to the browser. Never import `@/lib/env` here: it also
 * validates server-only secrets that must never reach a client bundle.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
